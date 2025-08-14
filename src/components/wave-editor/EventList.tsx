import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Event {
  index: number;
  type: string;
  content: string;
}

interface EventListProps {
  events: Event[];
  selectedEventIndex: number | null;
  onSelectEvent: (index: number) => void;
  selectedWaveIndex: number | null;
}

const EventList: React.FC<EventListProps> = ({ 
  events, 
  selectedEventIndex, 
  onSelectEvent,
  selectedWaveIndex 
}) => {
  return (
    <Card className="p-3 h-full">
      <div className="mb-3">
        <h2 className="text-sm font-medium">Events</h2>
        <p className="text-xs text-muted-foreground">
          {selectedWaveIndex !== null 
            ? `Wave ${selectedWaveIndex + 1} events`
            : "Select a wave to view events"
          }
        </p>
      </div>
      <ScrollArea className="h-[calc(100%-60px)]">
        <div className="flex flex-col gap-1">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {selectedWaveIndex !== null ? "No events in this wave" : "No wave selected"}
            </p>
          ) : (
            events.map((event, index) => (
              <Button
                key={index}
                variant={selectedEventIndex === index ? "default" : "ghost"}
                className="justify-start h-auto p-3 text-left touch-manipulation min-h-[3rem]"
                onClick={() => onSelectEvent(index)}
              >
                <div className="w-full">
                  <div className="font-medium text-sm">{event.type || `Event ${index + 1}`}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 whitespace-normal">
                    {event.content}
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
};

export default EventList;