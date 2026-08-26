import type { AnswerCandidate, Grading, Polygon, ProcessingResult, QuestionResult } from './types';

const questionTexts = [
  'Which blood vessel carries blood away from the heart?',
  'Which of the following organelles is primarily involved in photosynthesis?',
  'Explain the role of chloroplasts in photosynthesis, naming the main pigments involved and briefly outlining the two major stages of the process.',
  'Describe the flow of blood through the human heart starting from the right atrium and ending at the aorta; include the names of valves crossed.',
  'Draw a labelled diagram of an alveolus showing capillaries and air space.',
  'Draw a neat labelled diagram of the human digestive system and label the site where most absorption occurs.',
  'Draw and label a nephron.',
  'Explain the structural differences between palisade mesophyll and spongy mesophyll and state how each structure aids its function in the leaf.',
  'Describe the process of transpiration in plants and name two environmental factors that increase its rate.',
  'Explain how the structure of xylem vessels facilitates water transport in plants.',
  'A diagram shows two potted plants — Plant A in bright light and Plant B kept in dim light. Explain the difference.',
  'Suggest one practical measure to help Plant B recover.',
  'A resting person has tidal volume of 0.5 L and breathes 12 times per minute. Calculate minute ventilation.',
  'If dead space is 0.15 L per breath, calculate the alveolar ventilation per minute. Show working.',
];

const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11(a)', '11(b)', '12', '13'];
const scores = [[2,2],[2,2],[2,2],[0,2],[2,2],[4,5],[5,5],[3,5],[5,5],[4,5],[2,2],[1,3],[4,5],[4,5]];

function rect(left: number, top: number, right: number, bottom: number): Polygon {
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}

function grading(index: number): Grading | undefined {
  if (index === 3) return undefined;
  const [score, maxScore] = scores[index];
  return {
    score,
    maxScore,
    verdict: score === maxScore ? 'correct' : score / maxScore >= 0.6 ? 'mostly_correct' : 'needs_review',
    confidence: index === 11 ? 0.78 : 0.92,
    strengths: ['The response addresses the central concept.'],
    missingConcepts: score === maxScore ? [] : ['Add one more precise supporting detail.'],
    feedback: score === maxScore
      ? 'Excellent work. The answer identifies the key concept clearly and accurately.'
      : 'Good start. Add the missing supporting detail to make the answer complete.',
  };
}

function answerFor(index: number, questionId: string): AnswerCandidate | undefined {
  if (index === 3) return undefined;
  const y = 0.12 + (index % 5) * 0.145;
  return {
    id: `demo-answer-${index + 1}`,
    detectedQuestionNumber: numbers[index],
    normalizedDetectedNumber: numbers[index],
    text: index === 1
      ? 'Chloroplast. It contains chlorophyll which absorbs light energy for photosynthesis.'
      : `Student response for question ${numbers[index]} with the required explanation and labelled working.`,
    lines: [],
    regions: [{ page: 1, polygons: [rect(0.09, y, 0.91, Math.min(0.96, y + 0.09))] }],
    mappingConfidence: index === 11 ? 0.78 : 0.97,
    status: index === 11 ? 'uncertain' : 'matched',
    mappedQuestionId: questionId,
    mappingMethod: 'fixture:explicit_number+verified_geometry',
    candidateScores: [],
  };
}

export function demoResult(sessionId: string): ProcessingResult {
  const questions: QuestionResult[] = questionTexts.map((text, index) => {
    const id = `demo-q-${index + 1}`;
    const answer = answerFor(index, id);
    return {
      id,
      number: numbers[index],
      normalizedNumber: numbers[index],
      parentNumber: numbers[index].includes('(') ? numbers[index].split('(')[0] : undefined,
      order: index + 1,
      text,
      marks: scores[index][1],
      page: 1,
      sourcePolygons: [],
      confidence: 0.99,
      status: answer?.status === 'uncertain' ? 'uncertain' : answer ? 'matched' : 'unanswered',
      answer,
      grading: grading(index),
    };
  });
  const unmatched: AnswerCandidate = {
    id: 'demo-unmatched-1',
    text: 'A short extra response that cannot be matched safely to a paper question.',
    lines: [],
    regions: [{ page: 1, polygons: [rect(0.11, 0.9, 0.78, 0.95)] }],
    mappingConfidence: 0.41,
    status: 'unmatched',
    mappingMethod: 'below_acceptance_threshold',
  };
  return {
    sessionId,
    createdAt: new Date().toISOString(),
    questions,
    unmatchedAnswers: [unmatched],
    documents: {
      questionPaper: { name: 'Class_10_science_unit_test.pdf', mimeType: 'application/pdf', size: 2_184_320, pageCount: 2, url: '/assets/question-paper-demo.pdf' },
      answerSheet: { name: 'student_1_answer_sheet.png', mimeType: 'image/png', size: 1_284_203, pageCount: 1, url: '/assets/answer-sheet.png' },
    },
    warnings: ['Demo mode uses audited fixture OCR and geometry so it works without external API credentials.'],
    metrics: { matched: 12, unanswered: 1, uncertain: 1, unmatched: 1 },
  };
}

