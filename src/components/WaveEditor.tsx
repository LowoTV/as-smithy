import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";
import pako from "pako";
import WaveList from "./wave-editor/WaveList";
import EventList from "./wave-editor/EventList";
import PropertiesEditor from "./wave-editor/PropertiesEditor";
import FileControls from "./wave-editor/FileControls";

// Utility: base64 <-> bytes
function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, "");
  const bin = atob(cleaned);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function decodeZlibBase64(input: string): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const bytes = base64ToBytes(input);
    const tries = [
      () => pako.inflate(bytes),
      () => pako.inflateRaw(bytes),
      () => pako.ungzip(bytes),
    ];
    for (const t of tries) {
      try {
        const out = t();
        const text = new TextDecoder().decode(out);
        return { ok: true, text };
      } catch (_) {
        // try next
      }
    }
    return { ok: false, error: "Unable to inflate with zlib/raw/gzip." };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

function encodeZlibBase64(text: string): Uint8Array {
  const utf8 = new TextEncoder().encode(text);
  const deflated = pako.deflate(utf8);
  return deflated;
}

function collectStarIndices(s: string): number[] {
  const idx: number[] = [];
  for (let i = 0, cleanPos = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "*") {
      idx.push(cleanPos);
    } else if (/\s/.test(c)) {
      // ignore whitespace for positioning
    } else {
      cleanPos++;
    }
  }
  return idx;
}

function reinsertStars(b64: string, starPositions: number[]): string {
  if (!starPositions.length) return b64;
  const arr = b64.split("");
  // Insert from end to avoid shifting earlier positions
  const sorted = [...starPositions].filter((n) => n <= b64.length).sort((a, b) => b - a);
  for (const pos of sorted) {
    arr.splice(pos, 0, "*");
  }
  return arr.join("");
}

interface BlockMatch {
  index: number;
  quote: '"' | "'";
  innerStart: number;
  innerEnd: number;
  original: string;
  cleanedB64: string;
  starsAt: number[];
  decodedText?: string;
  likelyWaves: boolean;
}

interface Wave {
  index: number;
  content: string;
  events: Event[];
}

interface Event {
  index: number;
  type: string;
  content: string;
}

const WAVY_HINTS = ["AddBloon", "FollowBezier", "CreateTrain", "Wave", "Bloon", "AddWave"];

const WaveEditor: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const helpInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [blocks, setBlocks] = useState<BlockMatch[]>([]);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);

  const [waves, setWaves] = useState<Wave[]>([]);
  const [selectedWaveIndex, setSelectedWaveIndex] = useState<number | null>(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);
  const [eventDraft, setEventDraft] = useState<string>("");

  const [helpMarkdown, setHelpMarkdown] = useState<string>("");

  const parseWaves = useCallback((decodedText: string): Wave[] => {
    const lines = decodedText.split(/\r?\n/).filter(line => line.trim());
    console.log('Parsing waves from decoded text, total lines:', lines.length);
    console.log('First few lines:', lines.slice(0, 5));
    
    const waves: Wave[] = [];
    let currentWave: Wave | null = null;
    let orphanedLines: string[] = []; // Lines before first wave
    
    lines.forEach((line, index) => {
      // More flexible wave detection - look for wave-starting patterns
      const isWaveStart = line.includes("AddWave") || 
                         line.includes("CreateTrain") ||
                         /^Wave\s*\d+/i.test(line.trim()) ||
                         (line.includes("(") && line.includes(")") && index === 0); // First line with parameters
      
      if (isWaveStart) {
        // If we have orphaned lines and no current wave, create a wave for them
        if (orphanedLines.length > 0 && !currentWave) {
          waves.push({
            index: waves.length,
            content: `Wave ${waves.length + 1}`, // Default wave header
            events: orphanedLines.map((orphanLine, orphanIndex) => ({
              index: orphanIndex,
              type: orphanLine.includes("AddBloon") ? "AddBloon" :
                    orphanLine.includes("FollowBezier") ? "FollowBezier" :
                    orphanLine.includes("CreateTrain") ? "CreateTrain" :
                    "Unknown",
              content: orphanLine
            }))
          });
          orphanedLines = [];
        }
        
        // Push previous wave if exists
        if (currentWave) {
          waves.push(currentWave);
        }
        
        currentWave = {
          index: waves.length,
          content: line,
          events: []
        };
      } else if (currentWave) {
        // Add to current wave as event
        const eventType = line.includes("AddBloon") ? "AddBloon" :
                         line.includes("FollowBezier") ? "FollowBezier" :
                         line.includes("CreateTrain") ? "CreateTrain" :
                         "Unknown";
        
        currentWave.events.push({
          index: currentWave.events.length,
          type: eventType,
          content: line
        });
      } else {
        // No wave yet, collect orphaned lines
        orphanedLines.push(line);
      }
    });
    
    // Handle remaining orphaned lines if no waves were created
    if (orphanedLines.length > 0 && waves.length === 0 && !currentWave) {
      waves.push({
        index: 0,
        content: `Wave 1`, // Default wave header
        events: orphanedLines.map((orphanLine, orphanIndex) => ({
          index: orphanIndex,
          type: orphanLine.includes("AddBloon") ? "AddBloon" :
                orphanLine.includes("FollowBezier") ? "FollowBezier" :
                orphanLine.includes("CreateTrain") ? "CreateTrain" :
                "Unknown",
          content: orphanLine
        }))
      });
    }
    
    // Push final wave
    if (currentWave) {
      waves.push(currentWave);
    }
    
    console.log('Parsed waves:', waves.length);
    console.log('Wave summary:', waves.map(w => `Wave ${w.index + 1}: ${w.events.length} events`));
    
    return waves;
  }, []);

  const parseBlocks = useCallback((content: string): BlockMatch[] => {
    const rx = /(["'])(([A-Za-z0-9+/=\s\*]{64,}))\1/gm;
    const matches: BlockMatch[] = [];
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = rx.exec(content)) !== null) {
      const quote = m[1] as '"' | "'";
      const inner = m[2];
      const innerStart = (m.index ?? 0) + 1;
      const innerEnd = innerStart + inner.length;
      const cleaned = inner.replace(/[\s\*]/g, "");
      const starsAt = collectStarIndices(inner);
      let decoded: string | undefined = undefined;
      const res = decodeZlibBase64(cleaned);
      if (res.ok) decoded = res.text;
      const likely = !!decoded && WAVY_HINTS.some((h) => decoded!.includes(h));
      matches.push({
        index: idx++,
        quote,
        innerStart,
        innerEnd,
        original: inner,
        cleanedB64: cleaned,
        starsAt,
        decodedText: decoded,
        likelyWaves: likely,
      });
    }
    return matches;
  }, []);

  const onOpenFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      setFileName(file.name);
      setFileContent(text);
      const found = parseBlocks(text);
      setBlocks(found);
      if (!found.length) {
        toast({ title: "No blocks found", description: "No quoted base64+zlib blocks detected." });
        return;
      }
      const preferred = found.find((b) => b.likelyWaves && b.decodedText);
      const firstDecodable = preferred ?? found.find((b) => !!b.decodedText);
      if (firstDecodable) {
        const txt = firstDecodable.decodedText!;
        setSelectedBlockIdx(firstDecodable.index);
        const parsedWaves = parseWaves(txt);
        setWaves(parsedWaves);
        if (parsedWaves.length > 0) {
          setSelectedWaveIndex(0);
        }
      } else {
        toast({ title: "Decode failed", description: "Found blocks but failed to decode. You can still export raw payloads." });
      }
    } catch (e: any) {
      toast({ title: "Open failed", description: e?.message ?? String(e) });
    }
  }, [parseBlocks]);

  const handleChooseFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onOpenFile(f);
    e.currentTarget.value = ""; // reset
  }, [onOpenFile]);

  const handleSelectWave = useCallback((index: number) => {
    setSelectedWaveIndex(index);
    setSelectedEventIndex(null);
    setEventDraft("");
  }, []);

  const handleSelectEvent = useCallback((index: number) => {
    setSelectedEventIndex(index);
    const selectedWave = waves[selectedWaveIndex!];
    const selectedEvent = selectedWave?.events[index];
    setEventDraft(selectedEvent?.content || "");
  }, [waves, selectedWaveIndex]);

  const handleApplyEventEdit = useCallback(() => {
    if (selectedWaveIndex == null || selectedEventIndex == null) return;
    
    const newWaves = [...waves];
    newWaves[selectedWaveIndex].events[selectedEventIndex].content = eventDraft;
    setWaves(newWaves);
    
    toast({ 
      title: "Event updated", 
      description: `Updated event ${selectedEventIndex + 1} in wave ${selectedWaveIndex + 1}` 
    });
  }, [waves, selectedWaveIndex, selectedEventIndex, eventDraft]);

  const exportEdited = useCallback(() => {
    if (!fileContent || selectedBlockIdx == null) {
      toast({ title: "Nothing to export", description: "Open a file and decode a block first." });
      return;
    }
    const blk = blocks.find((b) => b.index === selectedBlockIdx);
    if (!blk) return;

    try {
      // Reconstruct the wave text from current waves state
      const waveText = waves.map(wave => {
        const waveLines = [wave.content, ...wave.events.map(event => event.content)];
        return waveLines.join('\n');
      }).join('\n');

      const deflated = encodeZlibBase64(waveText);
      const reB64 = bytesToBase64(deflated);
      const finalB64 = blk.starsAt.length ? reinsertStars(reB64, blk.starsAt) : reB64;

      const before = fileContent.slice(0, blk.innerStart);
      const after = fileContent.slice(blk.innerEnd);
      const newContent = `${before}${finalB64}${after}`;

      const suggested = fileName.endsWith(".as") ? fileName.replace(/\.as$/i, "_edited.as") : `${fileName || "waves"}_edited.as`;
      const blob = new Blob([newContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggested;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `${suggested} downloaded.` });
    } catch (e: any) {
      toast({ title: "Encode/export failed", description: e?.message ?? String(e) });
    }
  }, [fileContent, selectedBlockIdx, blocks, waves, fileName]);

  const openHelpFile = useCallback((file: File) => {
    file.text().then(setHelpMarkdown).catch((e) => {
      toast({ title: "Help load failed", description: e?.message ?? String(e) });
    });
  }, []);

  const selectedWave = selectedWaveIndex !== null ? waves[selectedWaveIndex] : null;
  const selectedEvent = selectedWave && selectedEventIndex !== null ? selectedWave.events[selectedEventIndex] : null;

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <FileText className="h-6 w-6 text-foreground" aria-hidden />
          <h1 className="text-xl font-semibold">BSM2 Wave Editor</h1>
          <div className="ml-auto">
            <input ref={fileInputRef} type="file" accept=".as,text/plain" className="hidden" onChange={handleFileChange} />
            <input ref={helpInputRef} type="file" accept=".md,text/markdown" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openHelpFile(f);
              e.currentTarget.value = "";
            }} />
            <FileControls
              onOpenFile={handleChooseFile}
              onExport={exportEdited}
              onLoadHelp={() => helpInputRef.current?.click()}
              helpMarkdown={helpMarkdown}
              fileName={fileName}
            />
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-primary/70 via-accent/60 to-secondary" />
      </header>

      <main className="container mx-auto px-4 py-6 flex flex-col lg:grid lg:grid-cols-12 gap-4 min-h-[calc(100vh-140px)]">
        <div className="lg:col-span-3 h-64 sm:h-80 lg:h-[calc(100vh-140px)]">
          <WaveList
            waves={waves}
            selectedWaveIndex={selectedWaveIndex}
            onSelectWave={handleSelectWave}
          />
        </div>

        <div className="lg:col-span-4 h-64 sm:h-80 lg:h-[calc(100vh-140px)]">
          <EventList
            events={selectedWave?.events || []}
            selectedEventIndex={selectedEventIndex}
            onSelectEvent={handleSelectEvent}
            selectedWaveIndex={selectedWaveIndex}
          />
        </div>

        <div className="lg:col-span-5 flex-1 lg:h-[calc(100vh-140px)]">
          <PropertiesEditor
            selectedEvent={selectedEvent}
            eventDraft={eventDraft}
            onEventDraftChange={setEventDraft}
            onApplyEdit={handleApplyEventEdit}
            selectedWaveIndex={selectedWaveIndex}
            selectedEventIndex={selectedEventIndex}
          />
        </div>
      </main>

      <footer className="border-t">
        <div className="container mx-auto px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>{fileName ? `Loaded: ${fileName}` : "No file loaded"}</span>
          <span>Never overwrites originals — always exports *_edited.as</span>
        </div>
      </footer>
    </div>
  );
};

export default WaveEditor;
