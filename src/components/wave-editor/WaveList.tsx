import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Event {
  index: number;
  type: string;
  content: string;
}

interface Wave {
  index: number;
  content: string;
  events: Event[];
}

interface WaveListProps {
  waves: Wave[];
  selectedWaveIndex: number | null;
  onSelectWave: (index: number) => void;
}

const WaveList: React.FC<WaveListProps> = ({ waves, selectedWaveIndex, onSelectWave }) => {
  return (
    <Card className="p-3 h-full">
      <div className="mb-3">
        <h2 className="text-sm font-medium">Waves</h2>
        <p className="text-xs text-muted-foreground">Select a wave to view its events</p>
      </div>
      <ScrollArea className="h-[calc(100%-60px)]">
        <div className="flex flex-col gap-1">
          {waves.length === 0 ? (
            <p className="text-sm text-muted-foreground">Open a file to load waves</p>
          ) : (
            waves.map((wave, index) => (
              <Button
                key={index}
                variant={selectedWaveIndex === index ? "default" : "ghost"}
                className="justify-start h-auto p-3 text-left touch-manipulation"
                onClick={() => onSelectWave(index)}
              >
                <div className="w-full">
                  <div className="font-medium text-sm">Wave {index + 1}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {wave.events.length} event{wave.events.length !== 1 ? 's' : ''}
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

export default WaveList;