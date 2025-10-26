export interface TracePoint {
    id: string;
    name: string;
    fileName: string;
    filePath: string;
    lineNumber: number;

    parentId?: string;
    childCount : number;

    projectPath: string;
    lineContent?: string;
    isValid: boolean;
    totalOccurrenceCount: number;
    occurrenceIndex: number;
    description: string;
}

export interface TracePointState {
    tracePoints: TracePoint[];
    selectedTracePointIds: string[];
    expandedTracePointIds: string[];
    highlightingEnabled: boolean;
}

export interface TracePointExportState {
    TracePointState: {
        tracePoints: {
            tracePoint: TracePoint[]; 
        };
        expandedTracePointIds:  {
            id: string[]; 
        };
        highlightingEnabled: boolean;
    };
}
