import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import { toast } from "@/hooks/use-toast";
import { FolderOpen, Save, HelpCircle, FileText, ArrowRight, Upload } from "lucide-react";
import pako from "pako";

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
  index: number; // block index among matches
  quote: '"' | "'";
  innerStart: number; // start index of inner content (without quotes)
  innerEnd: number; // end index of inner content (without quotes)
  original: string; // original inner content (as in file)
  cleanedB64: string; // original with * and whitespace removed
  starsAt: number[]; // positions to reinsert
  decodedText?: string; // lazily decoded
  likelyWaves: boolean;
}

const WAVY_HINTS = ["AddBloon", "FollowBezier", "CreateTrain", "Wave", "Bloon", "AddWave"];

const WaveEditor: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const helpInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [blocks, setBlocks] = useState<BlockMatch[]>([]);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);

  const [blockText, setBlockText] = useState<string>("");
  const [lines, setLines] = useState<string[]>([]);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [lineDraft, setLineDraft] = useState<string>("");

  const [helpMarkdown, setHelpMarkdown] = useState<string>("");

  const parseBlocks = useCallback((content: string): BlockMatch[] => {
    const rx = /(["'])(([A-Za-z0-9+/=\s\*]{64,}))\1/gm;
    const matches: BlockMatch[] = [];
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = rx.exec(content)) !== null) {
      const quote = m[1] as '"' | "'";
      const inner = m[2];
      const innerStart = (m.index ?? 0) + 1; // after opening quote
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
        setBlockText(txt);
        const ls = txt.split(/\r?\n/);
        setLines(ls);
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

  useEffect(() => {
    setLines(blockText.split(/\r?\n/));
  }, [blockText]);

  useEffect(() => {
    if (selectedLine != null) {
      setLineDraft(lines[selectedLine] ?? "");
    } else {
      setLineDraft("");
    }
  }, [selectedLine, lines]);

  const applyLineEdit = useCallback(() => {
    if (selectedLine == null) return;
    const next = [...lines];
    next[selectedLine] = lineDraft;
    const joined = next.join("\n");
    setLines(next);
    setBlockText(joined);
    toast({ title: "Line updated", description: `Updated line #${selectedLine + 1}` });
  }, [selectedLine, lineDraft, lines]);

  const exportEdited = useCallback(() => {
    if (!fileContent || selectedBlockIdx == null) {
      toast({ title: "Nothing to export", description: "Open a file and decode a block first." });
      return;
    }
    const blk = blocks.find((b) => b.index === selectedBlockIdx);
    if (!blk) return;

    try {
      const deflated = encodeZlibBase64(blockText);
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
  }, [fileContent, selectedBlockIdx, blocks, blockText, fileName]);

  const openHelpFile = useCallback((file: File) => {
    file.text().then(setHelpMarkdown).catch((e) => {
      toast({ title: "Help load failed", description: e?.message ?? String(e) });
    });
  }, []);

  const likelyBlocks = useMemo(() => blocks.map((b) => ({
    index: b.index,
    label: b.likelyWaves ? `Block #${b.index + 1} — Likely Waves` : `Block #${b.index + 1}`,
  })), [blocks]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <FileText className="h-6 w-6 text-foreground" aria-hidden />
          <h1 className="text-xl font-semibold">BSM2 Wave Editor</h1>
          <div className="ml-auto flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".as,text/plain" className="hidden" onChange={handleFileChange} />
            <Button variant="secondary" onClick={handleChooseFile}>
              <FolderOpen className="mr-2 h-4 w-4" /> Open .as
            </Button>
            <Button variant="default" onClick={exportEdited}>
              <Save className="mr-2 h-4 w-4" /> Save As / Export
            </Button>
            <input ref={helpInputRef} type="file" accept=".md,text/markdown" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openHelpFile(f);
              e.currentTarget.value = "";
            }} />
            <Button variant="outline" onClick={() => helpInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Load Help .md
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost">
                  <HelpCircle className="mr-2 h-4 w-4" /> Help
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Help</DialogTitle>
                </DialogHeader>
                <div className="prose prose-sm dark:prose-invert max-h-[60vh] overflow-y-auto">
                  {helpMarkdown ? (
                    <ReactMarkdown>{helpMarkdown}</ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground">Load a Markdown help file to display it here.</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-primary/70 via-accent/60 to-secondary" />
      </header>

      <main className="container mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-12 gap-4">
        <aside className="md:col-span-3">
          <Card className="p-3">
            <div className="mb-2">
              <h2 className="text-sm font-medium">Blocks</h2>
              <p className="text-xs text-muted-foreground">Select a decoded block (preferably Waves)</p>
            </div>
            <div className="flex flex-col gap-2">
              {likelyBlocks.length ? (
                likelyBlocks.map((b) => (
                  <Button
                    key={b.index}
                    variant={selectedBlockIdx === b.index ? "default" : "secondary"}
                    onClick={() => {
                      const blk = blocks.find((x) => x.index === b.index);
                      if (!blk?.decodedText) {
                        toast({ title: "Cannot decode", description: "This block failed to decode." });
                        return;
                      }
                      setSelectedBlockIdx(b.index);
                      setBlockText(blk.decodedText);
                      setSelectedLine(null);
                    }}
                  >
                    {b.label}
                  </Button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Open a file to list blocks.</p>
              )}
            </div>
          </Card>

          <Card className="p-3 mt-4">
            <div className="mb-2">
              <h2 className="text-sm font-medium">Waves</h2>
              <p className="text-xs text-muted-foreground">Select a line to edit</p>
            </div>
            <ScrollArea className="h-[40vh]">
              <div className="flex flex-col">
                {lines.filter((l) => l.trim().length > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No content decoded yet.</p>
                ) : (
                  lines.map((l, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedLine(i)}
                      className={`text-left px-2 py-1 border-b hover:bg-accent/60 focus:outline-none ${selectedLine === i ? 'bg-accent' : ''}`}
                    >
                      <span className="text-xs text-muted-foreground mr-2">{i + 1}.</span>
                      <span className="truncate inline-block max-w-full align-top">{l}</span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </aside>

        <section className="md:col-span-4">
          <Card className="p-3 h-full">
            <h2 className="text-sm font-medium mb-2">Events (placeholder)</h2>
            <div className="text-sm text-muted-foreground">
              Structured event editor coming soon.
            </div>
          </Card>
        </section>

        <section className="md:col-span-5">
          <Card className="p-3 h-full flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-medium">Raw Editor</h2>
              <p className="text-xs text-muted-foreground">Editing applies to the decoded block; export to write back into the .as file.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Selected line</label>
              <div className="flex items-center gap-2">
                <Textarea rows={2} value={lineDraft} onChange={(e) => setLineDraft(e.target.value)} placeholder={selectedLine != null ? `Line #${selectedLine + 1}` : "Pick a line from the left"} />
                <Button variant="secondary" onClick={applyLineEdit} disabled={selectedLine == null}>
                  Apply <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1">
              <Textarea className="h-[44vh]" value={blockText} onChange={(e) => setBlockText(e.target.value)} placeholder="Decoded block will appear here..." />
            </div>
          </Card>
        </section>
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
