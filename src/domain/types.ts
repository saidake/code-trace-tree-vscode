export interface TracePoint {
    id: string;
    name: string;
    fileName: string;
    filePath: string;
    lineNumber: number;
    parentId?: string;
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
        tracePointsContainer: {
            tracePoint: TracePoint[]; 
        };
        expandedTracePointIds: string[];
        highlightingEnabled: boolean;
    };
}
