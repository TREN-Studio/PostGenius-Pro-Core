import type { Blueprint } from '../types';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? 'https://www.postgeniuspro.com/api' : '/api';

export type ContentJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ContentInputType = 'keyword' | 'asin' | 'url';

export interface ContentJob {
    id: number;
    inputType: ContentInputType;
    inputValue: string;
    blueprintType: Blueprint;
    nicheTag: string | null;
    priority: number;
    status: ContentJobStatus;
    payload: Record<string, any>;
    result: Record<string, any>;
    errorMessage: string | null;
    attemptCount: number;
    maxAttempts: number;
    lockedBy: string | null;
    lockedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdBy: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface AutomationEvent {
    id: number;
    eventType: string;
    message: string;
    jobId: number | null;
    payload: Record<string, any>;
    createdAt: string | null;
}

export interface AutomationSettings {
    autoTrigger: boolean;
    workerIntervalSeconds: number;
    generateEndpoint: string;
    enabledNiches: Record<string, boolean>;
    lastWorkerRunAt: string | null;
    updatedAt: string | null;
}

export interface AutomationSnapshot {
    counts: Record<string, number>;
    jobs: ContentJob[];
    events: AutomationEvent[];
}

export interface AutomationState {
    settings: AutomationSettings;
    snapshot: AutomationSnapshot;
}

const request = async (endpoint: string, method: 'GET' | 'POST', payload?: any): Promise<any> => {
    const token = localStorage.getItem('auth_token') || '';
    const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Automation request failed (${res.status})`);
    }
    return data;
};

export const getAutomationState = async (): Promise<AutomationState> => {
    const data = await request('/automation/jobs?action=list', 'GET');
    return { settings: data.settings, snapshot: data.snapshot };
};

export const createContentJob = async (payload: {
    inputType: ContentInputType;
    inputValue: string;
    blueprintType: Blueprint;
    nicheTag?: string;
    priority?: number;
    maxAttempts?: number;
    payload?: Record<string, any>;
}): Promise<AutomationState> => {
    const data = await request('/automation/jobs?action=create', 'POST', payload);
    return { settings: data.settings, snapshot: data.snapshot };
};

export const setAutomationAutoTrigger = async (enabled: boolean): Promise<AutomationState> => {
    const data = await request('/automation/jobs?action=toggle_auto', 'POST', { enabled });
    return { settings: data.settings, snapshot: data.snapshot };
};

export const setAutomationGenerateEndpoint = async (generateEndpoint: string): Promise<AutomationState> => {
    const data = await request('/automation/jobs?action=set_endpoint', 'POST', { generateEndpoint });
    return { settings: data.settings, snapshot: data.snapshot };
};

export const setAutomationNiches = async (enabledNiches: Record<string, boolean>): Promise<AutomationState> => {
    const data = await request('/automation/jobs?action=set_niches', 'POST', { enabledNiches });
    return { settings: data.settings, snapshot: data.snapshot };
};

export const runAutomationWorkerNow = async (): Promise<AutomationState & { worker: any }> => {
    const data = await request('/automation/jobs?action=run_next', 'POST', {});
    return { settings: data.settings, snapshot: data.snapshot, worker: data.worker };
};

export const cancelContentJob = async (jobId: number): Promise<AutomationState> => {
    const data = await request('/automation/jobs?action=cancel_job', 'POST', { jobId });
    return { settings: data.settings, snapshot: data.snapshot };
};

export const retryContentJob = async (jobId: number): Promise<AutomationState> => {
    const data = await request('/automation/jobs?action=retry_job', 'POST', { jobId });
    return { settings: data.settings, snapshot: data.snapshot };
};

