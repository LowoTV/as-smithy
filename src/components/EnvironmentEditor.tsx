import React, { useCallback, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { Settings, FileText } from "lucide-react";
import pako from "pako";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import FileControls from "./wave-editor/FileControls";
import { Link } from "react-router-dom";

// Utility functions (same as WaveEditor)
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

interface EnvironmentVariable {
  name: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  category: string;
  rawLine: string;
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
  likelyEnvironment: boolean;
}

const ENV_HINTS = ["var ", "const ", "let ", "this.", "Environment", "Config", "Setting"];

const EnvironmentEditor: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const helpInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [blocks, setBlocks] = useState<BlockMatch[]>([]);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);
  const [environmentVars, setEnvironmentVars] = useState<EnvironmentVariable[]>([]);
  const [editingVar, setEditingVar] = useState<EnvironmentVariable | null>(null);
  const [helpMarkdown, setHelpMarkdown] = useState<string>("");

  const parseEnvironmentVariables = useCallback((decodedText: string): EnvironmentVariable[] => {
    const lines = decodedText.split(/\r?\n/);
    const variables: EnvironmentVariable[] = [];
    
    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) return;
      
      // Match variable declarations and assignments
      const patterns = [
        /(?:var|const|let)\s+(\w+)\s*[:=]\s*(.+);?/,  // var/const/let declarations
        /this\.(\w+)\s*[:=]\s*(.+);?/,                 // this. assignments
        /(\w+)\s*[:=]\s*(.+);?/,                       // general assignments
      ];
      
      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          const [, name, value] = match;
          const cleanValue = value.replace(/[;,]/g, '').trim();
          
          // Determine type and category
          let type: EnvironmentVariable['type'] = 'string';
          let category = 'General';
          
          if (/^(true|false)$/i.test(cleanValue)) {
            type = 'boolean';
          } else if (/^-?\d+(\.\d+)?$/.test(cleanValue)) {
            type = 'number';
          } else if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
            type = 'array';
          } else if (cleanValue.startsWith('{') && cleanValue.endsWith('}')) {
            type = 'object';
          }
          
          // Categorize based on name patterns
          if (/speed|velocity|rate|time|delay/i.test(name)) category = 'Performance';
          else if (/color|rgb|hex|alpha/i.test(name)) category = 'Visual';
          else if (/sound|audio|volume|music/i.test(name)) category = 'Audio';
          else if (/width|height|size|scale|position|x|y|z/i.test(name)) category = 'Layout';
          else if (/health|damage|score|points|lives/i.test(name)) category = 'Game';
          else if (/debug|test|dev|log/i.test(name)) category = 'Debug';
          
          variables.push({
            name,
            value: cleanValue,
            type,
            category,
            rawLine: trimmedLine
          });
          break;
        }
      }
    });
    
    console.log('Parsed environment variables:', variables.length);
    return variables;
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
      const likely = !!decoded && ENV_HINTS.some((h) => decoded!.includes(h));
      matches.push({
        index: idx++,
        quote,
        innerStart,
        innerEnd,
        original: inner,
        cleanedB64: cleaned,
        starsAt,
        decodedText: decoded,
        likelyEnvironment: likely,
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
      const preferred = found.find((b) => b.likelyEnvironment && b.decodedText);
      const firstDecodable = preferred ?? found.find((b) => !!b.decodedText);
      if (firstDecodable) {
        const txt = firstDecodable.decodedText!;
        setSelectedBlockIdx(firstDecodable.index);
        const parsedVars = parseEnvironmentVariables(txt);
        setEnvironmentVars(parsedVars);
      } else {
        toast({ title: "Decode failed", description: "Found blocks but failed to decode." });
      }
    } catch (e: any) {
      toast({ title: "Open failed", description: e?.message ?? String(e) });
    }
  }, [parseBlocks, parseEnvironmentVariables]);

  const handleChooseFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onOpenFile(f);
    e.currentTarget.value = "";
  }, [onOpenFile]);

  const handleEditVar = useCallback((variable: EnvironmentVariable) => {
    setEditingVar({ ...variable });
  }, []);

  const handleSaveVar = useCallback(() => {
    if (!editingVar) return;
    
    const newVars = environmentVars.map(v => 
      v.name === editingVar.name ? editingVar : v
    );
    setEnvironmentVars(newVars);
    setEditingVar(null);
    
    toast({ 
      title: "Variable updated", 
      description: `Updated ${editingVar.name}` 
    });
  }, [environmentVars, editingVar]);

  const exportEdited = useCallback(() => {
    if (!fileContent || selectedBlockIdx == null) {
      toast({ title: "Nothing to export", description: "Open a file and decode a block first." });
      return;
    }
    const blk = blocks.find((b) => b.index === selectedBlockIdx);
    if (!blk) return;

    try {
      // Reconstruct the environment text from current variables
      const envText = environmentVars.map(variable => {
        // Try to maintain original format
        if (variable.rawLine.includes('var ')) {
          return `var ${variable.name} = ${variable.value};`;
        } else if (variable.rawLine.includes('const ')) {
          return `const ${variable.name} = ${variable.value};`;
        } else if (variable.rawLine.includes('this.')) {
          return `this.${variable.name} = ${variable.value};`;
        } else {
          return `${variable.name} = ${variable.value};`;
        }
      }).join('\n');

      const deflated = encodeZlibBase64(envText);
      const reB64 = bytesToBase64(deflated);
      const finalB64 = blk.starsAt.length ? reinsertStars(reB64, blk.starsAt) : reB64;

      const before = fileContent.slice(0, blk.innerStart);
      const after = fileContent.slice(blk.innerEnd);
      const newContent = `${before}${finalB64}${after}`;

      const suggested = fileName.endsWith(".as") ? fileName.replace(/\.as$/i, "_env_edited.as") : `${fileName || "environment"}_edited.as`;
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
  }, [fileContent, selectedBlockIdx, blocks, environmentVars, fileName]);

  const openHelpFile = useCallback((file: File) => {
    file.text().then(setHelpMarkdown).catch((e) => {
      toast({ title: "Help load failed", description: e?.message ?? String(e) });
    });
  }, []);

  const groupedVars = environmentVars.reduce((acc, variable) => {
    if (!acc[variable.category]) acc[variable.category] = [];
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, EnvironmentVariable[]>);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Settings className="h-6 w-6 text-foreground" aria-hidden />
          <h1 className="text-xl font-semibold">BSM2 Environment Editor</h1>
          <nav className="ml-6">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              Wave Editor
            </Link>
          </nav>
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

      <main className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[calc(100vh-140px)]">
        {/* Variables List */}
        <div className="lg:col-span-2">
          <Card className="p-4 h-full">
            <div className="mb-4">
              <h2 className="text-lg font-medium">Environment Variables</h2>
              <p className="text-sm text-muted-foreground">
                {environmentVars.length} variable{environmentVars.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <ScrollArea className="h-[calc(100%-80px)]">
              <div className="space-y-6">
                {Object.keys(groupedVars).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Open a file to load environment variables</p>
                ) : (
                  Object.entries(groupedVars).map(([category, vars]) => (
                    <div key={category}>
                      <h3 className="font-medium text-sm mb-3 text-primary">{category}</h3>
                      <div className="space-y-2">
                        {vars.map((variable, index) => (
                          <Card key={`${category}-${index}`} className="p-3 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">{variable.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {variable.type}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {variable.value}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditVar(variable)}
                              >
                                Edit
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Editor Panel */}
        <div>
          <Card className="p-4 h-full">
            <div className="mb-4">
              <h2 className="text-lg font-medium">Edit Variable</h2>
              <p className="text-sm text-muted-foreground">
                {editingVar ? `Editing ${editingVar.name}` : "Select a variable to edit"}
              </p>
            </div>
            {editingVar ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="var-name">Name</Label>
                  <Input
                    id="var-name"
                    value={editingVar.name}
                    onChange={(e) => setEditingVar({ ...editingVar, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="var-value">Value</Label>
                  <Input
                    id="var-value"
                    value={editingVar.value}
                    onChange={(e) => setEditingVar({ ...editingVar, value: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="var-type">Type</Label>
                  <select
                    id="var-type"
                    value={editingVar.type}
                    onChange={(e) => setEditingVar({ ...editingVar, type: e.target.value as EnvironmentVariable['type'] })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="array">Array</option>
                    <option value="object">Object</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="var-category">Category</Label>
                  <Input
                    id="var-category"
                    value={editingVar.category}
                    onChange={(e) => setEditingVar({ ...editingVar, category: e.target.value })}
                  />
                </div>
                <div className="pt-4 space-y-2">
                  <Button onClick={handleSaveVar} className="w-full">
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditingVar(null)} className="w-full">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a variable from the list to start editing.</p>
            )}
          </Card>
        </div>
      </main>

      <footer className="border-t">
        <div className="container mx-auto px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>{fileName ? `Loaded: ${fileName}` : "No file loaded"}</span>
          <span>Environment variables editor — exports *_env_edited.as</span>
        </div>
      </footer>
    </div>
  );
};

export default EnvironmentEditor;