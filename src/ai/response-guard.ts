import type { GrowthFocus } from '../domain.js';
import type { ProviderLanguage } from './contracts.js';

/** Keep provider output to the one-question conversational contract. */
export function sanitizeQuestion(value: string): string {
  const firstLine = value.replace(/\r?\n/g, ' ').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim();
  // Models occasionally prepend a short acknowledgement even when asked for
  // one question. Keep the interrogative sentence itself so the CLI does not
  // turn “좋아요. ...?” into a pseudo-answer followed by a question.
  const questionEnd = firstLine.search(/[?？]/);
  let questionStart = 0;
  let quote: 'ascii' | 'curly' | undefined;
  if (questionEnd >= 0) {
    for (let index = 0; index < questionEnd; index += 1) {
      const character = firstLine[index];
      if (character === '“') quote = 'curly';
      else if (character === '”' && quote === 'curly') quote = undefined;
      else if (character === '"') quote = quote === 'ascii' ? undefined : 'ascii';
      else if (!quote && /[.!。！？]/.test(character ?? '')) questionStart = index + 1;
    }
  }
  const sentence = questionEnd >= 0
    ? firstLine.slice(questionStart, questionEnd + 1).trim()
    : (() => {
    const firstSentence = firstLine.search(/[.!。！？]/);
    const end = firstSentence >= 0 ? firstSentence + 1 : firstLine.length;
    return firstLine.slice(0, end);
  })();
  return sentence.slice(0, 180).trim();
}

export function containsBeginnerJargon(value: string, language: ProviderLanguage): boolean {
  const korean = /가정|전제|검증|스코프|시그널|신호|실현\s*가능성|현실성|타당성|차별화|차별성|차별점|경쟁력|경쟁\s*우위|경쟁사|성숙도|리스크|시장\s*(?:규모|조사|성)|수익\s*(?:모델|성)|확장성|우선순위|핵심\s*가설|가치\s*제안|문제\s*정의|실행\s*가능|제약|기술\s*(?:스택|적(?:으로)?\s*가능)|유저\s*플로우|백엔드|프론트엔드|데이터베이스|배포|프로토타입|요구사항|엔드포인트|스키마/i;
  const english = /\b(?:assumption|premise|validat(?:e|ed|ing|ion)|scope|signal|feasibility|viability|differentiation|differentiator|competitive(?:ness|\s+advantage)?|competitor|maturity|risk|market\s+(?:size|research|fit)|revenue\s+model|profitability|scalability|priority|core\s+hypothesis|value\s+proposition|product[- ]market\s+fit|mvp|persona|customer\s+profile|retention|conversion|roadmap|tech(?:nical)?\s+stack|technology|technical(?:ly)?|constraints|user\s+flow|target\s+(?:audience|user)|user\s+segment|customer\s+segment|api|cli|sdk|ui|ux|backend|frontend|database|db|endpoint|token|schema|deploy(?:ment)?|prototype|kpi|integration|requirement(?:s)?)\b/i;
  // Models occasionally answer in the wrong language. Check both vocabularies
  // so a Korean session does not receive an English jargon leak (or vice
  // versa), while keeping the selected language as the primary contract.
  const primary = language === 'ko' ? korean : english;
  const secondary = language === 'ko' ? english : korean;
  return primary.test(value) || secondary.test(value);
}

/** Keep one-question turns short enough for someone new to software. */
export function isTooComplexQuestion(value: string, language: ProviderLanguage): boolean {
  const compactLength = value.replace(/\s/g, '').length;
  const characterCount = [...value].length;
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const connectors = language === 'ko'
    ? (value.match(/그리고|또는|및|하면서|하려면|동시에|와|과/g) ?? []).length
    : (value.match(/\b(?:and|or|while|if|before|after|at the same time)\b/gi) ?? []).length;
  // A short sentence can still be too abstract for a first-time user. These
  // patterns target planning language that asks for a broad judgement instead
  // of one person, moment, action, or result; concrete questions remain valid.
  const abstractKorean = /(?:가장|제일)\s*(?:중요한|큰|위험한|강한)\s*(?:이유|가치|의미|방향|가능성|기준|이점)|(?:어떤|무슨)\s*(?:변화|영향|효과|가치|의미|방향|전략|원칙|기준|차별점|경쟁력|이점|결과)\s*(?:을|를|이|가)?\s*(?:만들|가져|정하|세우|잡|발전|선택|보여)|(?:효과가\s*있다는|잘\s*됐다는|성공했다는)\s*(?:걸|것을|것인지)?\s*어떻게\s*알|(?:계속|더|앞으로)\s*(?:만들|이어갈|할)\s*가치|(?:왜|어짜서)\s*(?:이|이런)\s*아이디어가?\s*(?:필요|좋|의미|성공)|(?:장기적으로|앞으로)\s*(?:어떤|무슨)\s*(?:방향|전략|모습)\s*(?:으로|을|를)?\s*(?:발전|정하|만들|가져)|(?:무엇|뻔)를?\s*(?:기준|원칙)으로\s*(?:정하|결정|선택)|(?:만들기|시작하기|사용하기)\s*(?:전에|전).*?(?:무엇|뻔|한\s*가지)/;
  const abstractEnglish = /\b(?:biggest|most important|strongest)\s+(?:reason|value|direction|strategy|principle|opportunity|benefit)|\bwhat\s+(?:broader\s+)?(?:impact|value|meaning|direction|strategy|principle|differentiator|competitive\s+edge|benefit|effect|result)\b|\bwhat\s+criteria\b|\b(?:how|what)\s+(?:would|could)\s+(?:we|i)\s+know\s+(?:this|it)\s+(?:helped|worked|is\s+working)\b|\bwhat\s+would\s+prove\b|\b(?:worth|value\s+of)\s+(?:continuing|building|making)\b|\bwhy\s+(?:should|does)\s+(?:this|the)\s+idea\s+(?:exist|matter|succeed|be\s+built)\b|\bwhat\s+makes\s+(?:this|the)\s+idea\s+(?:special|different|worth\s+building)\b|\bhow\s+should\s+(?:this|the)\s+idea\s+(?:grow|evolve|succeed)\b|\bbefore\s+(?:building|we\s+build|starting)\b.*\bwhat\b.*\b(?:one\s+thing|first)\b|\bwhat\s+should\s+we\s+(?:prioritize|focus\s+on)\b/i;
  // Check both vocabularies because a provider can answer in the wrong
  // language even when the requested content language is clear.
  const abstract = abstractKorean.test(value) || abstractEnglish.test(value);
  return (language === 'ko' ? compactLength > 76 || characterCount >= 80 : wordCount > 18) || connectors >= 2 || abstract;
}

/**
 * Last-resort questions must be safe even if both the model response and the
 * local provider response are malformed. Keep these concrete and tied to the
 * missing focus so a beginner never sees an internal planning term.
 */
export function safeQuestionCandidates(language: ProviderLanguage, focus: GrowthFocus): string[] {
  if (language === 'ko') {
    const questions: Record<GrowthFocus, string[]> = {
      user: [
        '처음 이 아이디어를 써볼 사람은 누구예요?',
        '가장 먼저 떠오르는 사용자는 누구예요?',
        '누가 이 아이디어를 가장 반가워할까요?',
        '오늘 이걸 써볼 사람은 누구일까요?',
      ],
      problem: [
        '그 사람이 가장 불편한 순간은 언제예요?',
        '그 사람은 언제 가장 답답해할까요?',
        '무엇 때문에 지금 가장 힘들어하나요?',
        '문제가 가장 크게 느껴지는 때는 언제예요?',
      ],
      goal: [
        '써본 뒤 무엇이 달라지면 좋을까요?',
        '이걸 써서 가장 먼저 얻고 싶은 것은 무엇인가요?',
        '처음 성공했다고 느낌 순간은 언제예요?',
        '한 번 써본 뒤 무엇을 할 수 있으면 좋을까요?',
      ],
      constraint: [
        '처음에는 무엇 하나만 해볼까요?',
        '첫날에는 어디까지 해보면 좋을까요?',
        '처음부터 넣지 않아도 되는 것은 무엇일까요?',
        '가장 작게 시작한다면 무엇을 해볼까요?',
      ],
      assumption: [
        '처음 누구에게 보여보고 어떤 반응을 볼까요?',
        '누구에게 먼저 보여주면 좋을까요?',
        '처음 보여줌을 때 어떤 반응이면 좋을까요?',
        '누가 써보면 이 생각이 괜찮은지 알 수 있을까요?',
      ],
      validation: [
        '써본 사람이 다시 찾을 이유는 무엇일까요?',
        '한 번 써본 뒤 무엇이 기억에 남으면 좋을까요?',
        '계속 쓰고 싶어지는 순간은 언제일까요?',
        '누가 써보고 좋다고 말하면 안심될까요?',
      ],
    };
    return questions[focus];
  }
  const questions: Record<GrowthFocus, string[]> = {
    user: ['Who would try this idea first?', 'Who comes to mind as the first person to use it?', 'Who would be happiest to have this?', 'Who might try it today?'],
    problem: ['When does that person feel most stuck?', 'What moment feels hardest for that person?', 'When does this problem bother them most?', 'What is the most frustrating moment?'],
    goal: ['What should feel different after using it?', 'What is the first useful result you want?', 'When would you feel that it worked?', 'What should someone be able to do after one try?'],
    constraint: ['What one thing should we try first?', 'How far should the first try go?', 'What can we leave out at first?', 'What is the smallest thing to try?'],
    assumption: ['Who could try this first, and what would you ask them?', 'Who could you show this to first?', 'What reaction would make you feel hopeful?', 'Who could tell you whether this idea makes sense?'],
    validation: ['What would make someone come back to it?', 'What should stick with someone after one try?', 'When would someone want to keep using it?', 'Whose positive reaction would reassure you?'],
  };
  return questions[focus];
}

export function safeQuestionFor(language: ProviderLanguage, focus: GrowthFocus): string {
  return safeQuestionCandidates(language, focus)[0]!;
}

export function unusedSafeQuestion(language: ProviderLanguage, focus: GrowthFocus, seenQuestions: string[]): string {
  const seen = new Set(seenQuestions.map((question) => sanitizeQuestion(question).toLocaleLowerCase()).filter(Boolean));
  const candidate = safeQuestionCandidates(language, focus).find((question) => !seen.has(question.toLocaleLowerCase()));
  if (candidate) return candidate;
  // A very long session can exhaust the focus-specific pool. Keep asking a
  // concrete question rather than repeating the first fallback forever.
  const generic = language === 'ko'
    ? ['지금 떠오르는 한 가지를 말해볼까요?', '아주 작은 답 하나만 골라볼까요?', '가장 먼저 생각나는 것을 말해볼까요?']
    : ['What is one thing that comes to mind?', 'What is one small answer you can choose?', 'What comes to mind first?'];
  const genericCandidate = generic.find((question) => !seen.has(question.toLocaleLowerCase()));
  if (genericCandidate) return genericCandidate;
  const base = language === 'ko' ? '지금 떠오르는 한 가지를 말해볼까요?' : 'What is one thing that comes to mind?';
  for (let index = 2; index <= 100; index += 1) {
    const numbered = language === 'ko' ? `${base.slice(0, -1)} (${index})?` : `${base.slice(0, -1)} (${index})?`;
    if (!seen.has(numbered.toLocaleLowerCase())) return numbered;
  }
  return safeQuestionFor(language, focus);
}

/**
 * Validate a question already persisted by an older Seed run. A pending
 * question bypasses the provider-generation path, so it needs the same
 * beginner-language guard when a user resumes after an upgrade.
 */
export function isBeginnerFriendlyQuestion(value: string, language: ProviderLanguage): boolean {
  const normalized = sanitizeQuestion(value);
  return Boolean(normalized)
    && !containsBeginnerJargon(value, language)
    && !isTooComplexQuestion(value, language)
    && !containsBeginnerJargon(normalized, language)
    && !isTooComplexQuestion(normalized, language);
}

/**
 * Keep model-written post-turn guidance as approachable as the next question.
 * Feedback is not always phrased with a question mark, so apply the same
 * jargon/complexity checks to short guidance sentences before they reach the
 * terminal. Empty guidance is fine; the user should never have to decode a
 * planning phrase just because a provider returned one.
 */
export function isBeginnerFriendlyFeedback(value: string, language: ProviderLanguage): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return Boolean(normalized)
    && normalized.length <= (language === 'ko' ? 120 : 180)
    && !containsBeginnerJargon(normalized, language)
    && !isTooComplexQuestion(normalized, language);
}

