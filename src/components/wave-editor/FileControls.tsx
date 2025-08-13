import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import { FolderOpen, Save, HelpCircle, Upload } from "lucide-react";

interface FileControlsProps {
  onOpenFile: () => void;
  onExport: () => void;
  onLoadHelp: () => void;
  helpMarkdown: string;
  fileName: string;
}

const FileControls: React.FC<FileControlsProps> = ({
  onOpenFile,
  onExport,
  onLoadHelp,
  helpMarkdown,
  fileName
}) => {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={onOpenFile}>
        <FolderOpen className="mr-2 h-4 w-4" /> Open .as
      </Button>
      <Button variant="default" onClick={onExport}>
        <Save className="mr-2 h-4 w-4" /> Export
      </Button>
      <Button variant="outline" onClick={onLoadHelp}>
        <Upload className="mr-2 h-4 w-4" /> Load Help
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
      {fileName && (
        <span className="text-sm text-muted-foreground ml-auto">
          {fileName}
        </span>
      )}
    </div>
  );
};

export default FileControls;