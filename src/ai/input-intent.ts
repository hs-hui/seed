/** What a growth reply asks of the conversation; only an `answer` is idea evidence. */
export type GrowthInputIntent = 'answer' | 'change-question' | 'pause';

const oneOf = (...parts: string[]): string => `(?:${parts.join('|')})`;

function normalize(value: string): { text: string; compact: string } {
  const text = value.trim().toLocaleLowerCase().replace(/[’‘`]/g, "'")
    .replace(/[!?.,:;~…。！？，、]+|[ㅠㅜㅋㅎ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { text, compact: text.replace(/\s+/g, '') };
}

// Korean is matched with spaces removed because beginners space the same
// phrase freely ("다른질문", "다른 질문"). Every clause is a complete control
// phrase; fillers are bounded so a trigger word cannot swallow a sentence.
const KO_FILL = `${oneOf('좀더', '조금더', '조금만', '조금', '좀', '더', '너무', '넘', '정말', '진짜', '완전', '되게', '약간', '많이', '그냥', '일단', '아직', '잘', '전혀', '아예', '하나도', '아무것도', '뭐가뭔지', '뭔지')}{0,3}`;
const KO_SELF = oneOf('저는', '저도', '저한테는', '저한테', '저에게는', '저에게', '제가', '전', '저', '나는', '나도', '나한테는', '나한테', '나에게는', '나에게', '내가', '난', '나');
const KO_THIS = oneOf('이거', '이건', '이게', '이것도', '이것은', '이것이', '이것', '그거', '그건', '그게', '이런거', '이런건', '이런게', '이런것도',
  '이런질문은', '이런질문이', '이런질문', '이질문은', '이질문이', '이질문도', '이질문', '그질문은', '그질문이', '질문은', '질문이', '질문도', '질문',
  '이말은', '이말이', '그말은', '그말이', '말이', '말은', '이내용은', '이내용이', '이표현은', '이표현이', '이단어가', '이용어가');
const KO_LEAD = `${KO_SELF}?${KO_FILL}${KO_THIS}?${KO_FILL}`;
const KO_HARD = oneOf('어려워(?:요|용|서|서요)?', '어렵(?:다|네|네요|습니다|군요|더라|더라고요)', '어려운데(?:요)?', '어려움',
  '힘들(?:어|어요|다|어서|어서요|네요)', '힘드네(?:요)?', '힘듦', '헷갈(?:려|려요|려서|려서요|리네|리네요|림|립니다)', '막막(?:해|해요|하다|하네요|함)');
// "너무 복잡해요" or "부담스러워요" can describe today's tools, so these count
// only when the speaker or the question is named ("이 질문이 부담스러워요").
const KO_HARD_REF = oneOf(KO_HARD, '복잡(?:해|해요|하다|하네|하네요|해서|해서요|함|합니다)', '추상적(?:이야|이에요|이네요|이다|이라서|임|입니다)?',
  '부담(?:스러워|스러워요|스럽네요|스럽다|돼|돼요|되네요|됨)', '애매(?:해|해요|하다|하네요|함)', '난해(?:해|해요|하다|하네요|함)');
const KO_HARD_THING = `${oneOf('어려운', '힘든', '복잡한', '헷갈리는', '추상적인', '부담스러운', '애매한', '난해한')}${oneOf('질문', '말', '거', '것', '얘기', '단어', '용어')}`
  + oneOf('이야', '이에요', '이예요', '이네요', '이네', '이다', '인데', '인데요', '이라서', '이라서요', '같아', '같아요', '같은데', '같은데요', '같네요', '같다');
const KO_DONT_KNOW = oneOf('모르겠(?:어|어요|다|네|네요|는데|는데요|음|습니다|어서|어서요)?', '모르겟(?:어|어요|다|음)?', '몰라(?:요|용|서|서요)?', '모름', '모르는데(?:요)?');
const KO_LOST = `이해${oneOf('가', '를', '는')}?${KO_FILL}${oneOf('안돼(?:요|서|서요)?', '안되(?:요|네요|는데|는데요)', '안됨', '안가(?:요|네요|는데요)?', '못하겠(?:어|어요|다|네요)?', '못했어(?:요)?')}`;
const KO_WHAT = `${oneOf('무슨', '뭔', '무엇')}${oneOf('말', '뜻', '소리', '질문', '의미', '얘기')}`;
const KO_ASK = oneOf('해줘', '해주세요', '해줄래', '해줄래요', '해줘요', '해봐', '해봐요', '줘', '주세요', '줄래', '줄래요', '부탁해', '부탁해요', '부탁드려요', '부탁드립니다',
  '물어봐', '물어봐요', '물어봐줘', '물어봐주세요', '물어봐줄래', '물어봐줄래요', '하자', '할래', '할래요', '가자', '넘어가', '넘어가요', '넘어가자', '넘어가줘', '넘어가주세요',
  '바꿔', '바꿔요', '바꿔줘', '바꿔주세요', '바꿔줄래', '바꿔줄래요', '바꾸자', '요');
const KO_REQ = oneOf('줘', '줘요', '주세요', '줄래', '줄래요', '주실래요', '주시겠어요', '줄수있어', '줄수있어요', '봐', '봐요', '봐줘');
const KO_DECIDE_REQ = oneOf('줘', '줘요', '주세요', '줄래', '줄래요');

const KO_CHANGE = [
  // Too hard, I don't know, I don't understand: "이 질문은 너무 어려워요", "잘 모르겠어", "이해가 안돼".
  `${KO_FILL}${oneOf(KO_HARD, KO_HARD_THING, KO_DONT_KNOW, KO_LOST)}`,
  `${oneOf(`${KO_SELF}${KO_FILL}${KO_THIS}?`, KO_THIS)}${KO_FILL}${oneOf(KO_HARD_REF, KO_HARD_THING, KO_DONT_KNOW, KO_LOST)}`,
  `${KO_LEAD}${KO_WHAT}${oneOf('이야', '이에요', '이예요', '예요', '에요', '인가요', '이죠', '일까요', '이지', '이요', '야', '요', '임')}?`,
  `${KO_LEAD}${KO_WHAT}인지${KO_FILL}${oneOf(KO_DONT_KNOW, KO_LOST)}`,
  `${KO_LEAD}${oneOf('뭘', '무엇을', '뭐를', '뭐')}${oneOf('물어보는지', '묻는지', '물어보시는지', '원하는지', '말하는지', '하라는건지', '하라는지', '답하라는건지', '대답하라는건지')}${KO_FILL}${KO_DONT_KNOW}`,
  `${oneOf('뭘', '무엇을', '뭐를')}${oneOf('물어보는', '묻는', '원하는', '말하는')}${oneOf('거야', '거예요', '거에요', '건가요', '건지', '거지', '거죠')}`,
  `${KO_SELF}?${oneOf('이질문에', '이질문엔', '그질문에', '질문에', '이거에', '이것에', '이건', '이거')}?${oneOf('답을', '답은', '대답을', '답변을')}?${oneOf('뭐라고', '뭘', '무엇을', '뭐를', '어떻게')}`
    + `${oneOf('답', '대답', '답변', '말')}?${oneOf('해야', '하면')}?${oneOf('할지', '될지', '좋을지')}${KO_FILL}${oneOf(KO_DONT_KNOW, '감이안와(?:요)?', '막막해(?:요)?')}`,
  `${KO_LEAD}${oneOf('답', '답변', '대답')}${oneOf('을', '를', '은', '이')}?${oneOf('하기', '하기가', '하기는', '하기도')}?${KO_FILL}`
    + oneOf(KO_HARD_REF, KO_DONT_KNOW, '못하겠(?:어|어요|다|네요|는데|는데요|음|습니다)?', '못하겟어(?:요)?', '못해(?:요)?', '못할것같아(?:요)?', '할수없어(?:요)?', '싫어(?:요)?'),
  `${KO_SELF}?${oneOf('아무', '딱히', '별로', '잘')}?${oneOf('생각', '감', '떠오르는게', '떠오르는것')}${oneOf('이', '도', '은', '가')}?${KO_FILL}`
    + oneOf('안나(?:요|네요|서|서요|는데|는데요)?', '안떠올라(?:요)?', '안떠오르네(?:요)?', '안와(?:요|서요)?', '안잡혀(?:요)?', '없어(?:요)?', '없네(?:요)?', '없는데(?:요)?'),
  `${KO_SELF}?${oneOf('개발', '코딩', '프로그래밍', '앱만들기', '앱개발')}${oneOf('은', '는', '을', '를', '이', '가', '쪽은', '쪽을')}?${KO_FILL}`
    + oneOf(KO_DONT_KNOW, '처음이라(?:서|서요)?', '처음이에요', '처음이야', '해본적이없어(?:요)?', '익숙하지않아(?:요|서|서요)?'),
  `${KO_THIS}${KO_FILL}${oneOf('개발자', '전문가', '코딩', '기술')}${oneOf('같아', '같아요', '같은데', '같은데요', '같네요', '스러워', '스러워요', '용어같아', '용어같아요', '용어야', '용어예요', '말같아', '말같아요', '질문같아', '질문같아요', '얘기같아', '얘기같아요')}`,
  // Skip, next, another or easier question: "패스", "건너뛸게요", "다른 질문 해줘", "쉬운 질문으로 바꿔줘".
  `${oneOf('이건', '이거', '이질문은', '이질문을', '이질문', '질문은', '질문을')}?${oneOf('그냥', '일단', '잠깐')}?`
    + oneOf('넘어갈게(?:요)?', '넘어가(?:자|요|줘|주세요|도돼|도돼요|도될까요)?', '넘어갈래(?:요)?', '건너뛸게(?:요)?', '건너뛰(?:자|어|어요|어줘|어주세요|기)', '건너뛸래(?:요)?',
      '스킵(?:할게|할게요|해|해줘|해주세요|하자|요)?', '패스(?:할게|할게요|해|해줘|해주세요|하자|요)?', '넘길게(?:요)?', '넘겨(?:줘|주세요)?'),
  `${KO_FILL}${oneOf('다른', '다음', '새로운', '새', '쉬운', '더쉬운', '간단한', '더간단한', '쉬운다른', '다른쉬운')}질문${oneOf('으로', '을', '를', '좀', '하나', '하나만', '으로좀')}?${KO_ASK}?`,
  `${oneOf('다른', '다음')}${oneOf('거', '것', '걸', '걸로', '거로', '것으로')}${KO_FILL}${KO_ASK}?`,
  `다음${oneOf('요', '으로', '으로가자', '으로넘어가', '으로넘어가줘', '으로넘어가주세요')}?`,
  `${oneOf('쉬운', '간단한', '더쉬운', '더간단한', '새로운')}${oneOf('거', '걸', '것')}${KO_FILL}${oneOf('물어봐', '물어봐요', '물어봐줘', '물어봐주세요', '물어봐줄래', '물어봐줄래요', '로해줘', '로해주세요', '로바꿔줘', '로바꿔주세요', '로물어봐줘')}`,
  // Rephrase, hint, example: "좀 더 쉽게 설명해줘", "다시 말해줘", "힌트 좀 줘", "예시 보여줘".
  `${oneOf('질문을', '질문좀', '질문', '이걸', '그걸', '이거', '그거')}?${KO_FILL}${oneOf('예시로', '예를들어', '예를들어서', '예를들면서')}?${KO_FILL}`
    + `${oneOf('쉽게', '간단하게', '간단히', '다르게', '다시', '천천히', '자세히', '자세하게', '풀어서', '알기쉽게', '쉬운말로', '다른말로')}?${KO_FILL}설명${oneOf('좀', '을', '을좀')}?`
    + oneOf('해줘', '해줘요', '해주세요', '해줄래', '해줄래요', '해주실래요', '해주시겠어요', '해봐', '해봐요', '부탁해', '부탁해요', '부탁드려요', '부탁드립니다'),
  `${oneOf('질문을', '질문좀', '질문', '말을', '말좀', '표현을', '이걸', '그걸', '이거', '그거')}?${KO_FILL}${oneOf('쉽게', '간단하게', '간단히', '다르게', '다시', '쉬운말로', '다른말로', '알기쉽게', '풀어서', '천천히', '예시로')}`
    + `${KO_FILL}${oneOf('말해', '얘기해', '물어봐', '물어', '해', '바꿔', '알려', '써')}${KO_REQ}`,
  `${oneOf('질문', '질문을', '질문좀', '말을', '표현을')}${KO_FILL}${oneOf('바꿔', '변경해', '다시해', '고쳐')}${KO_REQ}?`,
  `${oneOf('좀더', '조금더', '더')}?${oneOf('힌트', '예시', '예제')}${oneOf('를', '가', '좀', '하나', '하나만', '한개', '라도', '로')}?${oneOf('좀', '하나', '하나만', '한개')}?`
    + `${oneOf('줘', '줘요', '주세요', '줄래', '줄래요', '보여줘', '보여줘요', '보여주세요', '보여줄래', '보여줄래요', '알려줘', '알려주세요', '부탁해', '부탁해요', '부탁드려요', '있나요', '요')}?`,
  `예를좀?${oneOf('들어줘', '들어주세요', '들어줄래', '들어줄래요', '들어봐', '들어봐요', '들면', '들면요', '들어', '들어요', '들어서', '들어서요')}`,
  // Why do you ask, help: "왜 이걸 물어봐?", "왜요", "도와주세요".
  `${oneOf('이걸', '그걸', '이건', '그건', '이거', '그거', '이질문은', '이질문을', '질문을')}?왜${oneOf('요', '죠', '그래', '그래요')}?${oneOf('이걸', '그걸', '이런걸', '그런걸', '이질문을', '그질문을')}?`
    + `${oneOf('물어봐', '물어봐요', '물어보세요', '물어보는거야', '물어보는거예요', '물어보는거에요', '물어보는데', '물어보는데요', '물어', '물어요', '묻는거야', '묻는거예요', '묻는거에요',
      '궁금해', '궁금해요', '궁금하세요', '필요해', '필요해요', '필요한데', '필요한데요', '중요해', '중요해요', '알아야해', '알아야해요', '알아야돼', '알아야돼요')}?`,
  `${KO_FILL}${oneOf('도와줘', '도와줘요', '도와주세요', '도와줄래', '도와줄래요', '도와주실래요', '도움좀줘', '도움좀주세요', '살려줘', '살려주세요', '헬프')}`,
  // Hand the choice to Seed: "네가 알아서 정해줘", "AI가 판단해줘", "너한테 맡길게", "아무거나".
  `${oneOf('그냥', '그럼')}?${KO_THIS}?${oneOf('네가', '너가', '니가', '님이', '당신이', '너')}${oneOf('알아서', '직접', '대신', '다', '그냥', '좀', '마음대로', '맘대로')}{0,2}`
    + `${oneOf('판단해', '판단하게', '정해', '정하게', '골라', '고르게', '결정해', '결정하게', '선택해', '선택하게', '해', '하게', '물어봐')}${oneOf(KO_DECIDE_REQ, '봐', '도돼', '도돼요')}?`,
  `${oneOf('그냥', '그럼')}?${KO_THIS}?${oneOf('ai가', 'ai', '인공지능이', '인공지능', '시드가', 'seed가')}${oneOf('알아서', '직접', '대신', '다', '그냥', '좀')}{0,2}`
    + oneOf(`${oneOf('판단해', '정해', '골라', '결정해', '선택해', '해')}${KO_DECIDE_REQ}`, `${oneOf('판단하게', '정하게', '고르게', '결정하게', '선택하게', '하게')}${oneOf('해', '해줘', '해주세요', '하자')}?`),
  `${oneOf('그냥', '그럼')}?${oneOf('너한테', '당신한테', 'ai한테', 'ai에게', '너에게', '인공지능한테', '인공지능에게', '네게', '님한테')}${oneOf('맡길게', '맡길게요', '맡길래', '맡길래요', '맡겨', '맡겨요', '맡겨줘', '맡겨도돼', '맡겨도돼요', '넘길게', '넘길게요')}`,
  `${oneOf('그냥', '그럼')}?${oneOf('알아서', '마음대로', '맘대로', '대신')}${oneOf('판단해', '정해', '골라', '결정해', '선택해', '해')}${KO_DECIDE_REQ}?`,
  `${oneOf('정해', '골라', '판단해', '결정해', '선택해')}${KO_DECIDE_REQ}`,
  `${oneOf('아무거나', '아무것이나', '아무거')}${oneOf('요', '해줘', '해주세요', '물어봐', '물어봐줘', '골라줘', '정해줘', '괜찮아', '괜찮아요', '좋아', '좋아요')}?`,
  // Not that, or a hesitation on its own: "그건 아닌데", "이런 건 말고", "음...", "글쎄요".
  `${oneOf('그건', '그게', '그거', '이건', '이게', '이거', '그질문은', '이질문은', '그런건', '이런건', '그런거', '이런거', '그런게', '이런게')}좀?`
    + oneOf('아니', '아닌데', '아닌데요', '아니야', '아니에요', '아니예요', '아냐', '아니라', '아닌것같아', '아닌것같아요', '아닌거같아', '아닌거같아요', '아닌듯', '아닌듯해요', '말고'),
  oneOf('음{1,3}', '흠{1,3}', '으음{1,3}', '글쎄(?:요|다)?', '그냥', '그냥요'),
];

const KO_LATER_WHEN = oneOf('나중에', '다음에', '이따', '이따가', '좀있다가', '좀이따', '좀이따가', '조금있다가', '조금이따가', '잠시후에', '잠시후', '잠깐후에', '조금후에', '잠시뒤에', '조금뒤에', '내일');
const KO_LATER_LEAD = oneOf('일단', '지금은', '오늘은', '우선', '그럼', '그냥', '지금은말고', '지금말고', '지금은좀', '지금은안되고', '지금은어렵고');
const KO_PAUSE = [
  oneOf('잠깐', '잠깐만', '잠깐만요', '잠깐요', '잠시', '잠시만', '잠시만요', '잠깐기다려(?:줘|주세요)?', '잠깐만기다려(?:줘|주세요)?', '잠시만기다려(?:줘|주세요)?', '기다려(?:줘|주세요|봐|봐요)?'),
  oneOf('그만(?:요|할래|할래요|할게|할게요|하자|해|해요|하고싶어|하고싶어요|둘래|둘래요)?', '여기까지(?:만)?(?:요|할게|할게요|하자)?', '오늘은(?:여기까지|그만)(?:만)?(?:할게|할게요|하자)?',
    '멈춰(?:줘|주세요)?', '멈출게(?:요)?', '중단(?:할게|할게요|해줘|해주세요)?', '끝낼게(?:요)?', '끝내자', '이제그만', '이제끝', '일단멈춰', '일단그만', '쉬었다할게(?:요)?', '좀쉴게(?:요)?', '쉬고올게(?:요)?'),
  // "later" on its own is a control, but a time such as "내일" needs a verb.
  `${KO_LATER_LEAD}?${oneOf('나중에', '다음에', '이따', '이따가')}요?`,
  `${KO_LATER_LEAD}?${KO_LATER_WHEN}${oneOf('다시', '또', '좀')}?`
    + oneOf('답할게', '답할게요', '답해도돼', '답해도돼요', '답해도될까요', '답할래', '답할래요', '대답할게', '대답할게요', '답변할게', '답변할게요', '답하겠습니다',
      '할게', '할게요', '할께', '할께요', '할래', '할래요', '하자', '해요', '해도돼', '해도돼요', '해도될까요', '하겠습니다', '올게', '올게요', '돌아올게', '돌아올게요',
      '이어서할게', '이어서할게요', '이어갈게', '이어갈게요', '계속할게', '계속할게요', '생각해볼게', '생각해볼게요', '생각해볼께', '생각해볼께요', '생각할게', '생각할게요',
      '얘기할게', '얘기할게요', '말할게', '말할게요', '볼게', '볼게요', '보자'),
  `${KO_SELF}?${oneOf('잠깐', '잠시', '조금', '조금만', '좀', '일단', '우선', '다시', '천천히', '한번', '좀더', '조금더', '더')}{0,2}${oneOf('답', '답변', '대답', '그건', '그거', '이건', '이거')}?${oneOf('을', '를', '은', '는')}?`
    + `${oneOf('잠깐', '잠시', '조금', '조금만', '좀', '좀더', '조금더', '더', '한번')}{0,2}${oneOf('생각', '고민')}${oneOf('을', '좀', '을좀', '좀더', '조금', '조금만', '더')}{0,2}`
    + oneOf('해볼게', '해볼게요', '해볼께', '해볼께요', '해볼래', '해볼래요', '할게', '할게요', '할께', '할께요', '해봐야겠어', '해봐야겠어요', '해봐야겠다', '해봐야할것같아', '해봐야할것같아요',
      '해보고올게', '해보고올게요', '해보고답할게', '해보고답할게요', '해보고말할게', '해보고말할게요', '해야겠어', '해야겠어요', '해야겠다', '해야할것같아', '해야할것같아요',
      '중이에요', '중이야', '하는중', '하는중이에요', '할시간이필요해', '할시간이필요해요', '할시간좀줘', '할시간좀주세요'),
];
// Repeats stay bounded: without spaces, "음음음…" could otherwise be split
// across every interjection and clause slot.
const KO_INTERJECTION = oneOf('음{1,3}', '흠{1,3}', '으음{1,3}', '아{1,3}', '어{1,3}', '저기', '저기요', '잠깐', '잠깐만', '잠시만', '아니', '근데', '그런데', '그럼', '그러면', '솔직히', '사실', '미안', '미안해요', '죄송해요', '죄송한데', '죄송하지만', '그냥', '일단');

// English keeps word boundaries; the normalized text has single spaces.
const EN_OBJ = oneOf('this', 'that', 'it', 'this one', 'that one', 'this question', 'that question', 'the question');
const EN_QUESTION = oneOf('this question', 'that question', 'the question');
const EN_YOU = '(?:(?:can|could|would|will) you (?:please |just )?|please |just )?';
const EN_CHANGE = [
  // Skip, next, another or easier question.
  `(?:please )?(?:just )?(?:skip|pass|next|move on)(?: ${EN_OBJ}| on ${EN_OBJ}| for now| please){0,2}`,
  `(?:can|could|may) (?:we|i) (?:please |just )?(?:skip|pass|move on)(?: ${EN_OBJ}| on ${EN_OBJ}| for now| to the next (?:one|question)| please){0,2}`,
  `(?:let's|lets|let us|i'll|i will|i'd like to|i want to|i wanna) (?:just )?(?:skip|pass|move on)(?: ${EN_OBJ}| on ${EN_OBJ}| for now){0,2}`,
  '(?:the )?next (?:one|question)(?: please)?',
  'skip to the next (?:one|question)',
  `${EN_YOU}(?:ask|give)(?: me)?(?: (?:an?|one|some))? (?:another|different|new|easier|simpler|other|less difficult)(?: (?:question|one))?(?: (?:please|instead))?`,
  `${EN_YOU}ask(?: me)? (?:something|anything) (?:else|easier|simpler|different)(?: (?:please|instead))?`,
  '(?:an? )?(?:another|different|easier|simpler) (?:question|one)(?: please)?',
  '(?:a )?new question(?: please)?',
  '(?:can|could) (?:we|i) (?:have|get|try) (?:an? )?(?:another|different|new|easier|simpler) (?:question|one)(?: please)?',
  "(?:i|we) (?:want|need|would like|'d like) (?:an? )?(?:another|easier|simpler|different|new) question(?: please)?",
  `${EN_YOU}change (?:the|this) question(?: please)?`,
  // Rephrase or explain the question itself, never "explain <topic>".
  `${EN_YOU}(?:rephrase|reword|clarify|explain|repeat)(?: ${EN_OBJ}| what you mean(?: by that)?)?(?: (?:again|please|more simply|more clearly|a bit more|in simpler words|in plain words|in simpler terms|in plain english))?`,
  `${EN_YOU}simplify(?: ${EN_QUESTION})?(?: please)?`,
  `${EN_YOU}(?:say|ask) (?:that|it|this) again(?: please)?`,
  `${EN_YOU}(?:put|say|ask) (?:that|it|this) (?:differently|another way|more simply|in simpler words|in plain words)`,
  '(?:in )?(?:simpler|plain|plainer|easier) (?:words|terms|english)(?: please)?',
  // Not knowing, not understanding.
  "(?:i )?(?:really |just |honestly )?(?:don't|dont|do not) know(?: (?:yet|really|honestly))?"
    + `(?: (?:what to (?:say|answer|write|put)(?: here)?|how to (?:answer|respond)(?: (?:to )?${EN_OBJ})?|what you mean|what you're asking|what you are asking|what (?:this|that|it|the question) means|the answer))?`,
  "(?:i'm|im|i am) (?:really |just |honestly |still )?not (?:really |quite |too )?(?:sure|certain)(?: (?:yet|really|honestly))?"
    + `(?: (?:what you mean|what you're asking|what you are asking|what to (?:say|answer|write)(?: here)?|how to (?:answer|respond)(?: (?:to )?${EN_OBJ})?|about ${EN_OBJ}|what (?:this|that|it) means))?`,
  'not (?:really |quite )?sure(?: (?:yet|really))?',
  `(?:i )?(?:have )?(?:absolutely )?no (?:idea|clue)(?: (?:how to (?:answer|respond)(?: (?:to )?${EN_OBJ})?|what to (?:say|answer)|what you mean|what you're asking|what you are asking))?`,
  "(?:idk|dunno|i dunno|i'm dunno|im dunno)",
  `(?:i )?(?:can't|cant|cannot|can not) (?:answer|think of anything|think of an answer|think of one|say)(?: ${EN_OBJ})?`,
  "(?:nothing comes to mind|my mind is blank|i'm blanking|i'm drawing a blank)",
  `(?:i )?(?:really |just )?(?:don't|dont|do not) (?:understand|get it|get this|get that|get the question|follow|follow you)(?: (?:${EN_OBJ}|what you mean|what you're asking|what you are asking|the point|why))?`,
  `(?:i )?(?:can't|cant|cannot|can not) (?:understand|follow|make sense of)(?: (?:${EN_OBJ}|what you mean))?`,
  "(?:i'm|im|i am) (?:really |so |a bit |a little |kind of |kinda |totally |very |completely )?(?:confused|lost|stuck|overwhelmed|not following(?: you)?|not getting it)",
  "(?:this|that) (?:makes no sense|doesn't make sense|does not make sense|is not clear|isn't clear)(?: to me)?",
  '(?:not following|makes no sense)',
  // What do you mean, why do you ask.
  'what do you mean(?: by (?:that|this|it))?',
  'what does (?:this|that|it|the question) (?:even )?mean',
  'what (?:are|were) you asking(?: me)?',
  "what(?: is|'s) (?:this|that) (?:question )?(?:asking|about)",
  "what's that mean",
  'what(?: (?:again|exactly))?',
  '(?:huh|pardon|come again|sorry what|what was that)',
  'why(?: (?:are you asking(?: (?:this|that|me))?|do you ask(?: (?:this|that))?|do you want to know|do you need to know|ask(?: (?:this|that|me))?|is (?:this|that) (?:important|needed|relevant)|does (?:this|that|it) matter))?',
  // Too hard, confusing: about "this"/"the question", never "the problem is
  // difficult". Bare "complicated" or "too much" can describe today's tools.
  `(?:${EN_QUESTION}|this|that)(?:'s| is| feels| seems| sounds| looks| was)?(?: (?:a bit|kind of|kinda|way|really|so|very|too|pretty|quite|a little|rather|just|still)){0,3}`
    + ' (?:hard|difficult|confusing|unclear|vague|abstract|overwhelming|complicated|complex|tough|tricky|a lot|too much|heavy)(?: (?:to answer|for me|to me|for me to answer|right now))?',
  "(?:that's|this is|it's) a (?:hard|difficult|tough|tricky|confusing) (?:question|one)",
  '(?:(?:too|so|very|really) )?(?:hard|difficult|confusing)(?: (?:question|one))?(?: for me)?',
  '(?:a )?(?:tough|tricky) (?:question|one)',
  // Hand the choice to Seed.
  '(?:you|ai|the ai) (?:decide|choose|pick|judge)(?: (?:for me|one|it|this|that|one for me))?',
  '(?:please )?(?:just )?(?:let|have) (?:the )?(?:ai|you) (?:decide|choose|pick|judge)(?: (?:for me|this|that|it|one))?',
  '(?:please )?(?:just )?(?:decide|choose|pick)(?: (?:one|it|this|that))?(?: for me)?',
  "(?:i'll|i will|i'd|i would) (?:just )?leave(?: (?:it|this|that|the choice))?(?: up)? to you",
  "(?:it's |its )?(?:up to you|your call|your choice)",
  'you tell me',
  'whatever(?: you (?:think|want|like|say))?',
  "(?:i'm|im|i am) (?:fine|ok|okay|good) with (?:anything|whatever)",
  'anything (?:is fine|works|goes)',
  'no preference',
  // Not that.
  'not that(?: one)?',
  "(?:that's|that is) not (?:it|right|what i mean|what i meant)",
  'not what i (?:mean|meant)',
  'something else',
  // Hint, example, help on their own; "Example: a nurse who…" stays an answer.
  `${EN_YOU}(?:give me|show me|give|show|get me)(?: (?:a|an|some|one|another))? (?:hint|hints|example|examples|clue|tip|tips)(?: please)?`,
  '(?:can|could|may) i (?:get|have|see)(?: (?:a|an|some|one|another))? (?:hint|hints|example|examples|clue|tip|tips)(?: please)?',
  '(?:a |an |another |one |some )?(?:hint|hints|example|examples|clue)(?: please)?',
  '(?:for example|for instance|like what|such as|e g|eg)',
  'show me(?: how)?',
  '(?:please )?help(?: me)?(?: (?:please|out))?',
  '(?:i )?need (?:some )?help',
  '(?:can|could) you help(?: me)?(?: out)?',
  '(?:um+|uh+|uhm+|erm+|hmm+|hm+|mm+|meh|eh|well)',
];
const EN_PAUSE = [
  "(?:please )?(?:stop|pause|wait|hold on|hold up|one sec|one second|just a sec|just a second|just a moment|one moment|not now|not right now|later|maybe later|stop here|pause here"
    + "|that's enough|that is enough|enough for now|enough for today|i'm done|im done|i am done|done for now)(?: (?:please|for now|for today))?",
  "(?:let's|lets|let us) (?:stop|pause|take a break|continue later|stop here|pause here|stop for now|pause for now)",
  "(?:let me|lemme|i need to|i have to|i want to|i'd like to|i'll|i will|i gotta|gotta) (?:think|think about (?:it|this|that)|think it over|think this over|think on it|sleep on it|mull it over)"
    + '(?: (?:first|for a bit|for a moment|for a second|a bit|more|later))?',
  "(?:i'll|i will|i can|i'd like to|let me|can i|could i) (?:answer|respond|reply|come back(?: to (?:this|it|that))?|get back to (?:this|it|you|that)|return to (?:this|it|that)|continue|finish|do (?:this|it|that))(?: (?:this|it|that))? later",
  '(?:can|could) we (?:stop|pause|continue later|do this later|come back(?: to this)? later|take a break)',
  'give me (?:a |one |some )?(?:sec|second|moment|minute|bit|while|more time|time)(?: to think(?: about (?:it|this|that))?)?',
  '(?:i )?need (?:a |one )(?:sec|second|moment|minute)(?: to think(?: about (?:it|this|that))?)?',
  '(?:i )?need (?:some |more )?time to think(?: about (?:it|this|that))?',
  '(?:come back|get back to (?:this|it)|answer|talk|continue) later',
  "later(?: (?:i'll|i will) answer(?: (?:it|this|that))?)?",
];
const EN_INTERJECTION = '(?:um+|uh+|uhm+|erm+|hmm+|hm+|well|hey|oh|ok|okay|so|sorry|actually|honestly|wait)';

// Clauses are chained in code rather than in one regex: repeating these
// alternations inside a single pattern makes V8 spend hundreds of
// milliseconds compiling it on every CLI start.
type Grammar = { change: RegExp; pause: RegExp; lead: RegExp; join: RegExp; glue: string };
const whole = (patterns: string[]): RegExp => new RegExp(`^${oneOf(...patterns)}$`);
// Korean units are syllables of the space-free text, and its connectives
// ("…서", "…는데") belong to the clauses; English units are words.
const KOREAN: Grammar = { change: whole(KO_CHANGE), pause: whole(KO_PAUSE), lead: whole([KO_INTERJECTION]), join: /^$/, glue: '' };
const ENGLISH: Grammar = { change: whole(EN_CHANGE), pause: whole(EN_PAUSE), lead: whole([EN_INTERJECTION]), join: /^(?:and|so|but|then|or|just|please|also)$/, glue: ' ' };

/**
 * Read `units` as at most two interjections followed by one to three clauses
 * that are each a control on their own ("너무 어려워 다른질문", "This is hard,
 * let the AI decide"). Content anywhere in the reply breaks the chain.
 */
function isControlChain(units: string[], grammar: Grammar, isClause: (part: string) => boolean): boolean {
  const part = (from: number, to: number): string => units.slice(from, to).join(grammar.glue);
  // Remember each (position, clauses left) so "음음음…" is not re-scanned per path.
  const known = new Map<number, boolean>();
  const clauses = (from: number, left: number): boolean => {
    const key = from * 4 + left;
    if (!known.has(key)) known.set(key, scanClauses(from, left));
    return known.get(key)!;
  };
  const scanClauses = (from: number, left: number): boolean => {
    for (let to = from + 1; to <= units.length; to += 1) {
      if (!isClause(part(from, to))) continue;
      if (to === units.length) return true;
      if (left > 1 && (clauses(to, left - 1) || (grammar.join.test(units[to]!) && clauses(to + 1, left - 1)))) return true;
    }
    return false;
  };
  const leads = (from: number, left: number): boolean => {
    if (clauses(from, 3)) return true;
    for (let to = from + 1; left > 0 && to < units.length; to += 1) {
      if (grammar.lead.test(part(from, to)) && leads(to, left - 1)) return true;
    }
    return false;
  };
  return leads(0, 2);
}

const asksForChange = (grammar: Grammar) => (part: string): boolean => grammar.change.test(part);
const isControl = (grammar: Grammar) => (part: string): boolean => grammar.change.test(part) || grammar.pause.test(part);

/**
 * A short lead-in may precede a complaint about Seed's question itself ("앱을
 * 만들고 싶은데 이 질문은 너무 어려워서 네가 정해줘"). Only a tail naming this
 * question counts: "…but you decide" or "…지만 질문이 어려워요" (quiz content)
 * still reaches the model.
 */
function complainsAboutQuestionAfterLeadIn(text: string, compact: string): boolean {
  for (const match of compact.matchAll(/는데|은데|인데|지만/g)) {
    const tail = compact.slice(match.index + 2);
    if (match.index >= 1 && match.index <= 40 && /(?:이|이런|그)질문/.test(tail) && isControlChain([...tail], KOREAN, asksForChange(KOREAN))) return true;
  }
  const words = text.split(' ');
  return words.some((word, index) => index > 0 && /^(?:but|though|although|however)$/.test(word) && words.slice(0, index).join(' ').length <= 80
    && /\b(?:this|that) question\b/.test(words.slice(index + 1).join(' ')) && isControlChain(words.slice(index + 1), ENGLISH, asksForChange(ENGLISH)));
}

/**
 * Recognize explicit conversation controls only: the whole reply has to be a
 * short meta phrase ("skip", "모르겠어요", "let me think"), padded at most
 * with fillers or chained with another control. Ordinary answers often start
 * with the same words ("Later in the evening…", "예를 들어 학생들이…"), so
 * anything else is an `answer` here and is left to the AI classifier, which
 * also sees the question.
 */
export function detectGrowthInputIntent(value: string): GrowthInputIntent {
  const { text, compact } = normalize(value);
  // Only an empty reply pauses (the prompt says "press Enter without an
  // answer to pause"). "?", "ㅠㅠ" or "…" is a reaction without content, so
  // offer an easier question instead of ending the session.
  if (!text) return value.trim() ? 'change-question' : 'pause';
  // Explicit controls are short; a long reply is content however it starts.
  if (text.length > 120) return 'answer';
  const readings: Array<[string[], Grammar]> = [[[...compact], KOREAN], [text.split(' '), ENGLISH]];
  if (readings.some(([units, grammar]) => isControlChain(units, grammar, asksForChange(grammar))) || complainsAboutQuestionAfterLeadIn(text, compact)) return 'change-question';
  // A chain of controls that is not purely a question change contains a pause.
  if (readings.some(([units, grammar]) => isControlChain(units, grammar, isControl(grammar)))) return 'pause';
  return 'answer';
}
