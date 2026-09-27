/** The small deterministic safety net used when a provider cannot judge a reply. */
export type GrowthInputIntent = 'answer' | 'change-question' | 'pause';

function normalize(value: string): { text: string; compact: string } {
  const text = value.trim().toLocaleLowerCase().replace(/[!?.,。！？,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { text, compact: text.replace(/\s+/g, '') };
}

/**
 * Keep explicit conversation controls out of idea evidence while leaving
 * ordinary product statements alone. The patterns intentionally require a
 * short meta sentence or an imperative ending; a sentence such as
 * “students find questions difficult” remains a normal answer.
 */
export function detectGrowthInputIntent(value: string): GrowthInputIntent {
  const { text, compact } = normalize(value);
  if (!text) return 'pause';

  const changeQuestion = [
    // Short, natural skip/rephrase requests that do not always contain the
    // word "question". Keep these explicit so a beginner can speak freely
    // instead of memorising a command phrase.
    /^(?:그냥|일단|잠깐)?\s*(?:넘어갈게(?:요)?|넘어가자|넘어가줘|건너뛸게(?:요)?|건너뛰자|스킵할게(?:요)?|패스할게(?:요)?)[.!?]?$/,
    /^(?:다른|다음|새로운|쉬운|간단한?)\s*(?:질문|거|것|걸)?\s*(?:부탁해|부탁드려|해줘|해주세요|해주실래|물어봐|주세요)[.!?]?$/,
    /^(?:질문(?:을|은|이)?|이거|이건|이게)\s*(?:건너뛰|건너뛸|넘어가|넘어갈|스킵|패스)(?:할게|갈게|게요?|줘|주세요|자)?[.!?]?$/,
    /^(?:이거|이건|이게|이 질문|이런(?:게|건|거)?)(?:는|이|은|요)?\s*(?:너무|좀|정말|약간)?\s*(?:어렵|어려워|어려요|어려운|힘들|복잡|추상적|모르겠|모르겟|이해가안|이해안|헷갈)(?:요|어|다|네요|군요|는데요)?$/,
    /^(?:난|나는|저는|전|제가)\s+(?:이거|이건|이게|이 질문)\s*(?:너무|좀|정말)?\s*(?:어렵|어려워|어려요|힘들|복잡|모르겠|모르겟|이해가안|이해안|헷갈)(?:요|어|다|네요|군요)?$/,
    /^(?:다른|새|새로운)(?:질문|거|것|걸)(?:으로)?(?:바꿔|바꾸|해줘|해주세요|주세요|넘어가|물어봐)?$/,
    /^(?:다음|다른)(?:질문)(?:으로)?(?:넘어가|바꿔|물어봐)(?:줘|해줘|해주세요|주세요)?$/,
    /^(?:질문|말|표현|내용)(?:을|이)?(?:바꿔|바꾸어|변경해|다시물어|쉽게말해|간단하게말해)(?:줘|주세요)?$/,
    /^(?:이|그|이런)?(?:질문|말|표현|내용)(?:이|은|이요)?(?:너무|좀|정말)?(?:어렵|어려워|어려요|어려운|힘들|복잡|추상적|모르겠|모르겟|이해가안|이해안|헷갈)(?:요|어|다|네요|군요)?$/,
    /^(?:말이|이질문이|이런질문이|이말이|이내용이)(?:너무|좀|정말)?(?:어렵|어려워|어려요|힘들|복잡|추상적)(?:요|어|다|네요|군요)?$/,
    /^(?:저는|저|나는|난|제가|전).*(?:이런질문|이질문|이말|이내용).*(?:어려워|어려요|어렵다|어려움|힘들어|힘들어요|힘들다|모르겠어|모르겠어요|몰라|이해가안돼|헷갈려)$/,
    /^(?:저는|저|나는|난|제가|전).*(?:모르|몰라|이해|헷갈|어렵|어려|힘들).*(?:다른|다음|새로운?)질문.*(?:해줘|해주세요|물어봐|바꿔|넘어가)?$/,
    /^(?:저는|저|나는|난|제가|전).*(?:다른|다음|새로운?)질문.*(?:넘어가|바꿔|물어봐|해줘|해주세요|하고싶어|하고싶어요)$/,
    /^(?:아|아직|그냥)?(?:몰라|모르겠어|모르겠어요|모르겠|모르겟)(?:요|어|다|는데|서요)?$/,
    /^(?:너무|좀|정말)?(?:어렵다|어려워|어려요|힘들어|힘들어요|힘들다|복잡해|복잡하다|추상적이야|추상적)(?:네요|군요)?$/,
    /^(?:너무|좀|정말)?(?:어렵|어려워|어려요|어려운|힘들|복잡|추상적)(?:요|어|다)?(?:다른|다음|새로운?)질문(?:으로)?(?:해줘|해주세요|물어봐|바꿔)?$/,
    /^(?:너무|좀|정말)?(?:어렵|어려워|어려요|힘들|복잡|추상적).*(?:다른|다음|새로운?)질문.*(?:해줘|해주세요|물어봐|바꿔)?$/,
    /^(?:다른|다음|새로운?)질문.*(?:너무|좀|정말)?(?:어렵|어려워|어려요|힘들|복잡|추상적).*$/,
    /^(?:너무|좀|정말)?(?:어렵|어려운|어려워|어려요).*(?:질문).*(?:ai|인공지능).*(?:판단|알아서|정해).*(?:줘|주세요|해줘|해주세요)$/i,
    /^(?:너무|좀|정말)?(?:어렵|어려워|어려운|어려요|힘들|복잡).*(?:ai|인공지능).*(?:판단|알아서|정해|골라).*(?:하게|해줘|해주세요|해줄래)$/i,
    /^(?:이런(?:것도|거도)?|이것도|이런 건|이런거).*(?:ai|인공지능).*(?:판단|알아서|정해|골라).*(?:하게|해줘|해주세요|해줄래)$/i,
    /^(?:아무것도|잘|정말|아직)?(?:모르겠|모르겟|모르|몰라|감이안|생각이안|이해가안|이해안|헷갈)(?:어|어요|어?요|다|는데|는데요|서요|네요)?$/,
    /^(?:그냥|그냥요|글쎄요?|아무거나)(?:[.!?])?$/,
    /^(?:모르겠음|모름|잘\s*모르겠음|어려움|힘듦|막막함|헷갈림)(?:[.!?])?$/,
    /^(?:무슨질문인지|무슨말인지|무슨뜻인지|뭘묻는지|뭘원하는지).*(?:모르겠어|모르겠어요|모르|몰라|이해|헷갈)(?:요|어|다|는데|네요)?$/,
    /^(?:이건|이게|이질문|이말)?(?:무슨질문인지|무슨말인지|무슨뜻인지|뭘묻는지|뭘원하는지).*(?:모르겠어|모르겠어요|모르|몰라|이해|헷갈)(?:요|어|다|는데|네요)?$/,
    /^(?:이질문|이런질문|이말|이내용).*(?:무슨뜻인지|무슨말인지|뭘묻는지).*(?:모르|몰라|이해|헷갈)(?:요|어|다|는데|네요)?$/,
    /^(?:이|그|이런)?(?:질문|말|내용).*(?:무슨뜻|무슨말|무슨질문|뭘묻는|뭘원하는).*(?:모르|몰라|이해|헷갈).*$/,
    /^(?:모르|몰라|이해|헷갈).*(?:다른|다음|새로운?)질문.*$/,
    /^(?:무슨|뭘|뭐|도대체|대체).*(?:답|대답|말).*(?:하라는|해야|할지|모르|모르겠|어렵|힘들).*(?:요|어|다)?$/,
    /^(?:아무|잘|별로)?(?:생각|아이디어|감|답).*(?:안 ?나|없|모르|막혀).*$/,
    /^(?:무슨|뭘|뭐).*(?:모르|몰라|이해|헷갈).*(?:다른|다음|새로운?|걸|것|거).*(?:물어|질문|해줘|바꿔|넘어가).*$/,
    /^(?:저는|저|나는|난|제가|전)(?:좀|잘|정말)?(?:모르겠|모르겟|모르|몰라|어렵|어려|힘들|헷갈)(?:어|어요|어?요|다|는데)?$/,
    /^(?:뭐라고|뭘|어떻게).*(?:답|대답|말).*(?:해야|할지|모르|몰라|어렵|힘들|감이안|감이 안|막막).*(?:요|어|다|는데요|서요)?$/,
    /^뭐라고.*(?:해야|할지).*(?:모르|몰라|어렵|힘들).*(?:요|어|다)?$/,
    /^(?:답|답변|대답).*(?:어떻게|해야|할지|모르|모르겠|못하|어렵|힘들|막막|막혀).*(?:요|어|다)?$/,
    /^(?:전|저는|저|나는|난).*(?:이질문|이런질문|질문).*(?:어떻게|무슨말|무슨뜻).*(?:모르|몰라|이해|어렵|힘들|헷갈).*$/,
    /^(?:개발|코딩|프로그램|앱만들기).*(?:잘몰라|모르겠|처음이라|익숙하지|어려워)(?:요|어|다|서|서요)?$/,
    /^(?:이건|이런|이질문|이말).*(?:개발자|코딩|전문가).*(?:같|스러|질문|말|용어).*$/,
    /^(?:이런|이런건|이런거).*(?:말고|아니|어렵|힘들|모르|싫).*$/,
    /^(?:네가|너가|니가|당신이|ai가|인공지능이).*(?:정해|골라|판단|결정).*(?:해줘|해주세요|줘|주세요|해줄래|해주면|대신해)$/i,
    /^(?:ai|인공지능)(?:가)?(?:알아서|직접)?(?:판단|정해|골라|결정)(?:해줘|해주세요|줘|주세요)?$/i,
    // Beginners often delegate the choice without naming a question or an
    // AI. Treat that as a request for a gentler next prompt, but keep the
    // sentence-boundary guard so product descriptions such as
    // “네가 골라주는 앱” remain ordinary idea content.
    /^(?:그냥\s*)?(?:네가|너가|니가|당신이)\s*(?:알아서\s*)?(?:해|정해|골라|판단해?|결정해?|물어봐)(?:줘|주세요|줄래|도)?$/i,
    /^(?:그냥\s*)?(?:너한테|당신한테|AI한테)\s*(?:맡길게|맡길래|맡겨|맡겨줘|정해달라|골라달라)(?:요)?$/i,
    /^(?:아무거나|아무것이나).*(?:해|정해|골라|물어|알아서).*$/,
    /^(?:(?:좀더|조금더|좀|조금|더))?(?:힌트|예시|예를|예를들어|쉽게|다시말해|다르게말해|풀어서|설명해).*(?:줘|주세요|보여|말해|해줘|하나)?$/,
    /^(?:질문|답|대답).*(?:못하|하기싫|하기어려|할수없|할수가없).*(?:해줘|주세요|다른|다음|쉽게)?$/,
    /^(?:이거|이건|이게|이질문).*(?:말고|아니|싫|별로|안맞|맞지않|어렵|힘들|모르).*(?:해줘|주세요|물어|바꿔)?$/,
    /^(?:그건|그게|그거|그질문은|이건|이게).*(?:아니|아닌|아닌데|아니야|아니에요|말고)(?:것같아|것같아요)?$/,
    /^(?:음+|흠+|글쎄+|\?+)$/,
    /^(?:왜|왜요|도와줘|도와주세요|도와|help|helpme|무슨뜻이야|무슨말이야|뭔말이야|뭔질문이야|뭐라는거야|무슨소리야)$/i,
    /^(?:왜|왜요|이걸왜|질문을왜).*(?:물어|질문|필요|궁금).*$/,
    /^(?:패스|스킵|건너뛰|넘어가|다음질문)(?:으로)?(?:해|줘|주세요)?$/,
  ].some((pattern) => pattern.test(compact) || pattern.test(text));

  const changeEnglish = [
    /^(?:can|could|would)\s+(?:we|you)\s+(?:skip|move\s+on|ask\s+(?:another|a\s+different)|give\s+me\s+(?:another|an\s+easier))\b.*$/i,
    /^(?:i['’]?m|i am)\s+not\s+sure\s+what\s+(?:you['’]?re|you are)\s+asking\s*[.!?]?$/i,
    /^(?:i\s+)?don['’]?t\s+know\s+what\s+(?:you['’]?re|you are)\s+asking\s*[.!?]?$/i,
    /^(?:this|that|the question)\s+(?:is\s+)?(?:too\s+)?(?:hard|difficult|confusing|unclear|overwhelming|complicated)(?:\s+for\s+me)?\s*[.!?]?$/i,
    /^(?:i['’]?m|i am)\s+(?:stuck|lost|overwhelmed)\s*[.!?]?$/i,
    /^(?:another|different|new|easier|simpler)\s+(?:question|one)\s*[.!?]?$/i,
    /^(?:please\s+)?(?:ask|give|show)\s+(?:me\s+)?(?:an?\s+)?(?:another|different|new|easier|simpler)\b.*$/i,
    /^(?:please\s+)?(?:rephrase|simplify|clarify|explain)\b.*\b(?:question|this|that)\b.*$/i,
    /^(?:can you )?(?:explain|simplify|rephrase|say that again)\b/i,
    /^(?:this\s+)?question\s+(?:is\s+)?(?:too\s+hard|too\s+difficult|confusing)(?:\s+for\s+me)?\s*[.!?]?$/i,
    /^(?:i['’]?m|i am)\s+(?:not sure|confused)(?:\s+(?:what you mean|what to say|how to answer|about this))?.*$/i,
    /^(?:i\s+)?(?:just\s+)?don['’]?t know(?:\s+(?:what you mean|what to say|how to answer))?\s*[.!?]?$/i,
    /^(?:i\s+)?(?:have no idea|have no clue)\s+(?:how to )?(?:answer|respond)\b.*$/i,
    /^(?:hint|example|give me an example|show me how)\b.*$/i,
    /^(?:can you|could you|give me|show me|i need)\b.*\b(?:hint|example|help|simpler|easier)\b.*$/i,
    /^(?:please\s+)?(?:let|have)\s+(?:the\s+)?ai\s+(?:decide|judge|help|explain)\b.*$/i,
    /^(?:you|ai)\s+(?:decide|choose|pick|judge)(?:\s+(?:for\s+me|one|it|this))?\s*[.!?]?$/i,
    /^(?:just\s+)?(?:decide|choose|pick)\s*(?:one(?:\s+for\s+me)?|for\s+me|it|this)?\s*[.!?]?$/i,
    /^(?:i['’]?ll|i will)\s+(?:leave|leave it)\s+to\s+you\s*[.!?]?$/i,
    /^(?:this|that|it)\s+(?:is\s+)?(?:too\s+)?(?:hard|difficult|confusing).*\b(?:let|have)\s+(?:the\s+)?ai\s+(?:decide|judge|choose)\b.*$/i,
    /^(?:too hard|this is too hard|hard|confusing|i['’]?m confused|this makes no sense|i\s+don['’]?t\s+know|i\s+don['’]?t understand|i\s+do not understand|not sure|no idea|idk|skip|pass|next question)\s*[.!?]?$/i,
    /^(?:i\s+)?(?:don['’]?t|do not|cannot|can['’]?t)\s+(?:know|understand)\b.*\b(?:answer|respond)\b/i,
    /^(?:how|what)\s+(?:should|do)\s+i\s+(?:answer|say)\b/i,
    /^(?:why are you asking|why do you ask|what does that mean|what are you asking)\s*\??$/i,
    /^(?:not that|not what i mean|that['’]?s not it|that['’]?s not what i mean|something else)\s*$/i,
    /^(?:whatever|up to you|your call|i['’]?m fine with anything)\s*[.!?]?$/i,
    /^(?:no clue|no idea|i['’]?m?\s*dunno|meh|no preference)\s*[.!?]?$/i,
    /^(?:could you )?(?:ask|give)\s+(?:me\s+)?(?:an?\s+)?(?:easier|simpler)\s+(?:question|one)\s*\??$/i,
    /^(?:this|that|the)\s+(?:is\s+)?(?:too\s+hard|too\s+difficult|confusing|unclear|overwhelming)\b.*$/i,
    /^(?:too\s+hard|too\s+difficult|confusing|not\s+sure|don['’]?t\s+know|no\s+idea).*(?:another|different|new|easier|simpler|next)\s+question/i,
    /^(?:i|we)\s+(?:want|need|would\s+like)\s+(?:an?\s+)?(?:easier|simpler|different|another)\s+question\b.*$/i,
  ].some((pattern) => pattern.test(text));

  // A deterministic safety net cannot enumerate every way a beginner may
  // describe confusion. Combine several signals instead of matching a single
  // word: a difficulty/uncertainty signal plus a self/question reference or a
  // direct request. This keeps ordinary product statements such as
  // “users need an easier question” as idea content.
  const koreanDifficulty = /어려|힘들|복잡|추상적|부담|막막|헷갈|모르|몰라|이해가\s*안|감이\s*안|생각이\s*안|못하|답답|뭔\s*소리|무슨\s*말/;
  const koreanQuestionReference = /(?:이거|이건|이게|이 질문|질문|말|뜻|무슨|뭔|뭘|무엇|답|대답)/;
  const koreanPersonal = /(?:저는|저|나는|난|제가|전|내가|나한테|저한테|이거|이건|이게|이 질문|질문이|질문|말이|내용이|무슨|뭔|뭘|무엇|답|답변|대답|이해|그냥|일단|너무|전혀|아직)/;
  const koreanDirectRequest = /(?:다른|다음|새로운|쉬운|쉽게|간단|바꿔|바꾸|넘어가|건너뛰|스킵|패스|물어봐|설명|도와|힌트|예시|알아서|판단|정해|골라|못하|할\s*수\s*없|해줘|해주세요|주세요|하자)/;
  const productStatement = /(?:(?:앱|서비스|도구|기능|사용자|학생|사람|아이디어).*(?:제공|만들|돕|해결|필요|가능|원하|기능|앱|서비스|도구|한다|이다|있다)|(?:앱|서비스|도구|기능)(?:이야|입니다|이다)?|^(?:이\s*)?(?:앱|서비스|도구|기능)(?:은|는|이|가)?\s+.*(?:다|요))$/;
  // A third-person observation is usually product evidence, even when it
  // contains words such as "difficult" or "another question". Keep it out
  // of the help-request path unless the speaker clearly addresses Seed.
  const thirdPersonProductStatement = /^(?:학생들?|사용자들?|사람들?|이\s*앱|우리\s*앱|앱|서비스|도구|기능)(?:은|는|이|가|들이|들은|들은)?\s+.+/;
  const productIntentStatement = /(?:앱|서비스|도구|기능|학생들?|사용자|사람들?|아이디어).*(?:돕고\s*싶|도와주고\s*싶|만들고\s*싶|해결하고\s*싶|하고\s*싶|원한다)/;
  // A mixed sentence can start as a product idea and end as a direct help
  // request. Let the speaker's explicit first-person difficulty/delegation
  // override the product guard, while third-person product descriptions stay
  // answers (for example, “AI가 어려운 질문을 판단하는 앱”).
  const koreanMetaOverride = /^(?:저는|저|나는|난|제가|전|내가)(?:\s|$)/.test(text)
    && koreanDifficulty.test(text) && /(?:네가|너가|니가|당신이|ai가|인공지능|알아서|판단|정해|골라|맡길)/i.test(text);
  const koreanSignalChange = !thirdPersonProductStatement.test(text) && (!productStatement.test(text) || koreanMetaOverride) && (!productIntentStatement.test(text) || koreanMetaOverride) && (
    (koreanDifficulty.test(text) && koreanPersonal.test(text) && (koreanQuestionReference.test(text) || koreanDirectRequest.test(text) || compact.length <= 42))
    || (koreanDirectRequest.test(text) && /(?:해줘|해주세요|주세요|물어봐|바꿔|넘어가|건너뛰|판단|정해|골라|도와|설명|하자)/.test(text) && compact.length <= 80)
    || (/^(?:음+|흠+|저기|잠깐|아)\s*/.test(text) && koreanDirectRequest.test(text) && (koreanQuestionReference.test(text) || /(?:예시|힌트|설명|도와|보여)/.test(text)) && compact.length <= 80)
  );
  const englishDifficulty = /\b(?:hard|difficult|confusing|unclear|abstract|overwhelming|complicated|stuck|lost|not sure|no idea|don't know|do not know|can't answer|cannot answer|don't understand|do not understand|too much|a lot|not following|don't get|do not get|make sense|makes no sense|what does this mean|what does that mean)\b/i;
  const englishReference = /\b(?:this|that|the question|i|i'm|i am|what|how|why|answer|respond)\b/i;
  const englishDirectRequest = /\b(?:another|different|new|easier|simpler|next|rephrase|simplify|clarify|explain|help|hint|example|skip|pass|decide|judge|choose|ask|give|mean)\b/i;
  const englishPauseLike = /^(?:give me|i need)\s+(?:a\s+)?(?:second|moment|minute|more time|some time)(?:\s+to think)?$/i.test(text);
  const englishProductIntentStatement = /\b(?:i|we)\s+(?:want|would like|plan|hope|need)\s+to\s+(?:help|build|make|create|solve|design)\b/i.test(text);
  const englishProductStatement = /\b(?:app|service|tool|feature|users?|students?|people|beginners?|idea)\b.*\b(?:offers?|provides?|helps?|solves?|needs?|need|want|prefer|builds?|should|can|could|would|find|struggle|experience|say|feel|have)\b/i.test(text);
  const englishMetaOverride = /^(?:i|we)\b/i.test(text) && englishDifficulty.test(text)
    && /\b(?:you|ai|decide|choose|pick|judge|leave\s+it\s+to\s+you)\b/i.test(text);
  const englishSignalChange = !englishPauseLike && (!englishProductIntentStatement || englishMetaOverride) && (!englishProductStatement || englishMetaOverride)
    && ((englishDifficulty.test(text) && englishReference.test(text) && (englishDirectRequest.test(text) || text.length <= 72))
      || (englishDirectRequest.test(text) && /\b(?:please|can you|could you|let|have|ask|give|show|make|help)\b/i.test(text) && text.length <= 100)
      || (/^(?:um|uh|well|hey)[,\s]+/i.test(text) && englishDirectRequest.test(text) && /\b(?:question|one)\b/i.test(text) && text.length <= 100));

  if (changeQuestion || changeEnglish || koreanSignalChange || englishSignalChange) return 'change-question';

  const pause = [
    /^(?:잠깐|잠시|잠깐만|잠깐만요|잠깐요|그만|여기까지|일단멈춰|멈춰|stop|pause|later|not now|letmethink|answerlater|holdon)$/i,
    /^(?:잠깐|잠시|잠깐만)\s*(?:생각|조금만|잠깐만).*(?:할게|해볼게|해보고|후에|뒤에)/,
    /^(?:잠깐|잠시|잠깐만).*(?:나중에|다음에|후에|뒤에).*(?:답|생각|이어|돌아|할게)/,
    /^(?:조금생각|생각해보고|나중에|나중에답|일단멈춰).*(?:할게|해볼게|해보고|답|생각|이어|돌아|하자|하겠습니다)?$/,
    /^(?:그만|여기까지|일단|멈춰).*(?:할게|하고\s*싶|할래|하자|멈출게|그만할게|이제\s*끝)/,
    /^(?:저는|저|나는|난|제가|전)?\s*(?:(?:좀|조금|조금만)\s*)?생각\s*(?:(?:좀|조금|조금만)\s*)?(?:해볼게|해볼께|해봐야|해보고|할게)(?:요|다)?$/,
    /^(?:답|답변|대답|질문).*(?:생각해볼게|생각해볼께|생각할게|나중에)/,
    /^(?:다음에|나중에).*(?:생각|답|할게|하자|돌아)/i,
    /^(?:일단|지금은|오늘은).*(?:나중에|다음에)(?:.*(?:답|생각|이어|돌아|할게|하자|할까요|하겠습니다))?$/i,
    /^(?:let me think|come back later|i['’]?ll answer later|i will answer later|answer later|hold on|get back to (?:this|it) later)$/i,
    /^(?:later|not now|hold on|let me think|answer later)\b.*$/i,
    /^(?:i|we)\s+(?:need|want|have)\s+to\s+think(?:\s+about\s+(?:this|it|that))?$/i,
    /^i(?:['’]?ll| will) think about (?:it|this)(?: first)?$/i,
    /^i(?:['’]?ll| will) get back to (?:this|it) later$/i,
    /^(?:give me|i need).*(?:a second|a moment|one minute|more time)(?:to think)?$/i,
    /^(?:잠깐|잠시|조금).*?(?:후에|뒤에).*(?:답|생각|돌아|이어|할게)/,
    /^(?:i['’]?ll|i will|can we|could we).*(?:think about|come back to|return to|answer).*(?:later|this later|it later)$/i,
    /^(?:i need|give me).*(?:a minute|more time|some time)(?:to think)?$/i,
    /^(?:stop|pause|not now|later|that['’]?s enough)\s*[.!?]?$/i,
  ].some((pattern) => pattern.test(compact) || pattern.test(text));
  return pause ? 'pause' : 'answer';
}
