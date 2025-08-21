import React from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface EnvironmentAsset {
  index: number;
  type: string;
  name: string;
  properties: Record<string, string>;
  rawContent: string;
}

interface EnvironmentAssetsProps {
  assets: EnvironmentAsset[];
}

const EnvironmentAssets: React.FC<EnvironmentAssetsProps> = ({ assets }) => {
  const getAssetTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'texture':
      case 'image':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'audio':
      case 'sound':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'model':
      case '3d':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'script':
      case 'code':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <Card className="p-3 h-full">
      <div className="mb-3">
        <h2 className="text-sm font-medium">Environment Assets</h2>
        <p className="text-xs text-muted-foreground">
          {assets.length} asset{assets.length !== 1 ? 's' : ''} found
        </p>
      </div>
      <ScrollArea className="h-[calc(100%-60px)]">
        <div className="flex flex-col gap-3">
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No environment assets found</p>
          ) : (
            assets.map((asset, index) => (
              <Card key={index} className="p-3 bg-muted/30">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm truncate">{asset.name}</h3>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getAssetTypeColor(asset.type)}`}
                    >
                      {asset.type}
                    </Badge>
                  </div>
                  
                  {Object.keys(asset.properties).length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        {Object.entries(asset.properties).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="text-right max-w-[60%] truncate">{value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Raw Content
                    </summary>
                    <pre className="mt-2 p-2 bg-background rounded text-[10px] overflow-x-auto whitespace-pre-wrap">
                      {asset.rawContent}
                    </pre>
                  </details>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
};

export default EnvironmentAssets;