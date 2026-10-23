export type CompanyId = 'confidence' | 'isocon' | 'all';
export type ChatRole = 'user' | 'assistant';
export type LocalRecord = Record<string, any>;

export interface CompanyProfile extends LocalRecord {
  id: string;
  name: string;
  short: string;
  cnpj: string;
  location: string;
  cnaes: LocalRecord[];
  cats?: CatRecord[];
  participationHistory?: LocalRecord[];
}

export interface ProfessionalEvidenceFact extends LocalRecord {
  label: string;
  value: string;
  page: number | null;
  evidence: string;
}

export interface ProfessionalEvidenceActivity extends LocalRecord {
  description: string;
  unit: string;
  quantity: string;
  page: number | null;
  evidence: string;
}

export interface CatProfessionalAssignment extends LocalRecord {
  name: string;
  title: string;
  registration: string;
  role: string;
  identityEvidence?: Record<'name' | 'title' | 'registration', { page: number | null; evidence: string }>;
  properties: ProfessionalEvidenceFact[];
  activities: ProfessionalEvidenceActivity[];
  profileId?: string;
}

export interface CatRecord extends LocalRecord {
  id: string;
  number: string;
  professionals?: CatProfessionalAssignment[];
  professionalProfileIds?: string[];
  professionalAnalysis?: LocalRecord;
  customFields?: Array<{ id: string; label: string; value: string }>;
}

export interface ProfessionalProfile extends LocalRecord {
  id: string;
  companyId: string;
  name?: string;
  title?: string;
  registration?: string;
  catIds: string[];
  documentIds?: string[];
  catExperiences?: LocalRecord[];
  notes?: string;
}

export interface NoticeRecord extends LocalRecord {
  id: string;
  agency: string;
  company: string;
  object: string;
  deadline: string;
  status: string;
}

export interface ProposalRecord extends LocalRecord {
  id: string;
  noticeId: string;
  company: string;
  amount: number;
  status: string;
  deadline: string;
}

export interface AssistantMessage extends LocalRecord {
  role: ChatRole;
  text: string;
  time?: string;
  note?: string;
  diagnostic?: boolean;
  diagnosticNote?: string;
  documentText?: string;
  attachments?: Array<{ id: string; name: string; type: string; size: number; usedAsCat?: boolean }>;
}

export interface PrumoState extends LocalRecord {
  notices: NoticeRecord[];
  proposals: ProposalRecord[];
  items: LocalRecord[];
  quoteDocuments: LocalRecord[];
  companyDocuments?: LocalRecord[];
  selectedQuoteDocument: string;
  clients: LocalRecord[];
  companyRecords: Record<string, LocalRecord>;
  cnaeProfiles: Record<string, LocalRecord[]>;
  professionalProfiles: ProfessionalProfile[];
  noticeHistory: LocalRecord[];
  memories: LocalRecord[];
  routines: LocalRecord[];
  chatMessages: AssistantMessage[];
  proposalChats: Record<string, AssistantMessage[]>;
  catChats: Record<string, AssistantMessage[]>;
  activeCompany: CompanyId;
  page: string;
  navigationCollapsed: boolean;
  navigationExpandedOnCats: boolean;
  selectedNotice: string;
  selectedProposal: string;
  selectedItem: string;
  selectedCat: LocalRecord | null;
  selectedProfessionalProfile: string;
  settings: LocalRecord;
  demoBannerVisible: boolean;
}

export interface AssistantChatRequest {
  messages: Array<{ role: 'system' | ChatRole; content: string }>;
  max_tokens: number;
  temperature: number;
  routineId?: string;
}

export interface AssistantChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
  detail?: string;
  message?: string;
}

// The existing interface uses delegated controls and dynamic data attributes.
// Keep those browser event edges typed as dynamic values; application/service
// state and HTTP boundaries remain described above.
declare global {
  interface Element { [property: string]: any; }
  interface EventTarget { [property: string]: any; }
  interface Event { [property: string]: any; }
}
