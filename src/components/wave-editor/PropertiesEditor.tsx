import React from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface Event {
  index: number;
  type: string;
  content: string;
}

interface PropertiesEditorProps {
  selectedEvent: Event | null;
  eventDraft: string;
  onEventDraftChange: (value: string) => void;
  onApplyEdit: () => void;
  selectedWaveIndex: number | null;
  selectedEventIndex: number | null;
}

const PropertiesEditor: React.FC<PropertiesEditorProps> = ({
  selectedEvent,
  eventDraft,
  onEventDraftChange,
  onApplyEdit,
  selectedWaveIndex,
  selectedEventIndex
}) => {
  return (
    <Card className="p-3 h-full flex flex-col">
      <div className="mb-3">
        <h2 className="text-sm font-medium">Properties Editor</h2>
        <p className="text-xs text-muted-foreground">
          {selectedEvent 
            ? `Editing ${selectedEvent.type || `Event ${(selectedEventIndex ?? 0) + 1}`} from Wave ${(selectedWaveIndex ?? 0) + 1}`
            : "Select an event to edit its properties"
          }
        </p>
      </div>

      {selectedEvent ? (
        <div className="flex-1 flex flex-col gap-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Event Parameters</label>
            <div className="flex items-start gap-2">
              <Textarea 
                rows={4}
                value={eventDraft}
                onChange={(e) => onEventDraftChange(e.target.value)}
                placeholder="Event parameters..."
                className="flex-1"
              />
              <Button 
                variant="secondary" 
                onClick={onApplyEdit}
                className="shrink-0"
              >
                Apply <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-2 block">Raw Event Content</label>
            <Textarea 
              className="h-full min-h-[200px] font-mono text-xs"
              value={selectedEvent.content}
              readOnly
              placeholder="Raw event content will appear here..."
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-center">
            Select an event from the Events panel to edit its properties
          </p>
        </div>
      )}
    </Card>
  );
};

export default PropertiesEditor;