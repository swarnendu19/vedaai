export type ProviderName = 'azure' | 'google' | 'mistral';

export type Point = { x: number; y: number };
export type Polygon = Point[];

export type OCRWord = {
  id: string;
  text: string;
  normalizedText: string;
  confidence: number;
  page: number;
  polygon: Polygon;
  provider: ProviderName;
  lineId?: string;
  blockId?: string;
  handwritten?: boolean;
  crossedOutProbability?: number;
};

export type OCRLine = {
  id: string;
  page: number;
  text: string;
  words: OCRWord[];
  polygon: Polygon;
  confidence: number;
  provider: ProviderName;
};

export type OCRPage = {
  page: number;
  width: number;
  height: number;
  lines: OCRLine[];
  provider: ProviderName;
};

export type Question = {
  id: string;
  number: string;
  normalizedNumber: string;
  parentNumber?: string;
  order: number;
  text: string;
  marks?: number;
  page: number;
  sourcePolygons: Polygon[];
  confidence: number;
};

export type AnswerRegion = {
  page: number;
  polygons: Polygon[];
  startLineId?: string;
  endLineId?: string;
};

export type MappingScore = {
  questionId: string;
  number: number;
  semantic: number;
  llm: number;
  sequence: number;
  ocr: number;
  total: number;
};

export type AnswerCandidate = {
  id: string;
  detectedQuestionNumber?: string;
  normalizedDetectedNumber?: string;
  text: string;
  lines: OCRLine[];
  regions: AnswerRegion[];
  mappingConfidence: number;
  status: 'matched' | 'unmatched' | 'uncertain';
  mappedQuestionId?: string;
  mappingMethod?: string;
  candidateScores?: MappingScore[];
};

export type Grading = {
  score: number;
  maxScore: number;
  verdict: string;
  confidence: number;
  strengths: string[];
  missingConcepts: string[];
  feedback: string;
};

export type QuestionResult = Question & {
  status: 'matched' | 'unanswered' | 'uncertain';
  answer?: AnswerCandidate;
  grading?: Grading;
};

export type DocumentSummary = {
  name: string;
  mimeType: string;
  size: number;
  pageCount: number;
  url: string;
};

export type ProcessingResult = {
  sessionId: string;
  createdAt: string;
  questions: QuestionResult[];
  unmatchedAnswers: AnswerCandidate[];
  documents: {
    questionPaper: DocumentSummary;
    answerSheet: DocumentSummary;
  };
  warnings: string[];
  metrics: {
    matched: number;
    unanswered: number;
    uncertain: number;
    unmatched: number;
  };
};

export type UploadedDocument = {
  name: string;
  mimeType: string;
  size: number;
  pageCount: number;
  bytes: Uint8Array;
};

export type ProgressStage =
  | 'upload_received'
  | 'preparing_documents'
  | 'reading_question_paper'
  | 'extracting_questions'
  | 'reading_answer_sheet'
  | 'detecting_answer_regions'
  | 'matching_answers'
  | 'verifying_mappings'
  | 'grading'
  | 'preparing_highlights'
  | 'complete'
  | 'failed';

export type ProgressEvent = {
  percent: number;
  stage: ProgressStage;
  label: string;
  detail?: string;
  at: string;
};

export type ProcessingSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  demo: boolean;
  status: 'created' | 'ready' | 'processing' | 'complete' | 'failed';
  questionPaper?: UploadedDocument;
  answerSheet?: UploadedDocument;
  progress: ProgressEvent;
  result?: ProcessingResult;
  error?: string;
};

