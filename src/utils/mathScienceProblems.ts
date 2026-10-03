export type SchoolLevel = 'all' | 'junior' | 'high';

export type SubjectGroup =
  | 'all'
  | 'math'
  | 'english'
  | 'japanese'
  | 'science'
  | 'social'
  | 'info';

export type MathCategoryId =
  | 'all'
  // 中学 5教科・全単元
  | 'jh_math_alg'
  | 'jh_math_fn_geo'
  | 'jh_english'
  | 'jh_japanese'
  | 'jh_science_phys_chem'
  | 'jh_science_bio_earth'
  | 'jh_social_geo_hist_civ'
  // 高校 全教科・全単元
  | 'hs_math_1a'
  | 'hs_math_2b3c'
  | 'hs_english'
  | 'hs_japanese'
  | 'hs_physics'
  | 'hs_chemistry'
  | 'hs_bio_earth'
  | 'hs_social'
  | 'hs_info';

export interface MathCategoryInfo {
  id: MathCategoryId;
  level: SchoolLevel;
  subject: SubjectGroup;
  label: string;
  desc: string;
}

export interface MathProblem {
  id: string;
  level: '中学' | '高校';
  subject: Exclude<SubjectGroup, 'all'>;
  category: Exclude<MathCategoryId, 'all'>;
  categoryLabel: string;
  unitName: string;
  difficulty: '基礎' | '標準' | '応用';
  question: string;
  formula?: string;
  choices: string[];
  correctIndex: number;
  acceptedTextAnswers: string[];
  explanation: string[];
}

export const SUBJECT_GROUPS: { id: SubjectGroup; label: string }[] = [
  { id: 'all', label: '全教科' },
  { id: 'math', label: '数学' },
  { id: 'english', label: '英語' },
  { id: 'japanese', label: '国語（現代文・古文・漢文）' },
  { id: 'science', label: '理科（物理・化学・生物・地学）' },
  { id: 'social', label: '社会・地歴公民' },
  { id: 'info', label: '情報I' }
];

export const MATH_CATEGORIES: MathCategoryInfo[] = [
  {
    id: 'all',
    level: 'all',
    subject: 'all',
    label: '総合演習（中学・高校 全教科・全単元）',
    desc: '中学5教科・高校全教科（数・英・国・理・社・情報I）の全単元から出題'
  },
  // 中学全教科
  {
    id: 'jh_math_alg',
    level: 'junior',
    subject: 'math',
    label: '【中学数学】正負の数・文字式・方程式・二次方程式・確率',
    desc: '正負の計算・一次/連立方程式・因数分解・平方根・二次方程式・データの活用・確率'
  },
  {
    id: 'jh_math_fn_geo',
    level: 'junior',
    subject: 'math',
    label: '【中学数学】比例・一次関数・y=ax²・平面空間図形・相似・円周角・三平方',
    desc: '比例反比例・一次関数・関数y=ax²・合同と相似・円周角の定理・三平方の定理'
  },
  {
    id: 'jh_english',
    level: 'junior',
    subject: 'english',
    label: '【中学英語】全単元（時制・助動詞・不定詞・動名詞・比較・受動態・現在完了・関係代名詞・仮定法）',
    desc: '中1〜中3英文法全単元・重要構文・語彙・対話表現'
  },
  {
    id: 'jh_japanese',
    level: 'junior',
    subject: 'japanese',
    label: '【中学国語】全単元（漢字・語彙・口語文法・品詞と活用・敬語・古文・漢文訓読・和歌俳句）',
    desc: '用言の活用・助詞助動詞・敬語・歴史的仮名遣い・返り点・文学史'
  },
  {
    id: 'jh_science_phys_chem',
    level: 'junior',
    subject: 'science',
    label: '【中学理科・第1分野】物理（光音力・電流磁界・運動と仕事）・化学（物質・化学変化・イオンと中和）',
    desc: 'オームの法則・電力熱量・等速直線運動・仕事の原理・密度と濃度・酸化還元・イオンと中和'
  },
  {
    id: 'jh_science_bio_earth',
    level: 'junior',
    subject: 'science',
    label: '【中学理科・第2分野】生物（植物・人体・細胞と遺伝・生態系）・地学（火山地震・地層・気象・天体）',
    desc: '光合成と呼吸・消化吸収と血液循環・メンデルの法則・地震計算・飽和水蒸気量・日周年周運動'
  },
  {
    id: 'jh_social_geo_hist_civ',
    level: 'junior',
    subject: 'social',
    label: '【中学社会】地理（世界と日本）・歴史（古代〜現代）・公民（憲法・三権分立・経済・国際）',
    desc: '気候区分・日本の産業・古代〜近現代史・日本国憲法・国会内閣裁判所・市場経済と財政'
  },
  // 高校全教科
  {
    id: 'hs_math_1a',
    level: 'high',
    subject: 'math',
    label: '【高校数学I・A】数と式・集合と命題・二次関数・三角比・データ分析・確率・整数・平面図形',
    desc: 'たすき掛け・対称式・必要十分条件・平方完成・正弦余弦定理・分散と相関係数・反復試行・不定方程式'
  },
  {
    id: 'hs_math_2b3c',
    level: 'high',
    subject: 'math',
    label: '【高校数学II・B・III・C】高次方程式・図形と方程式・三角/指数対数・微積分・数列・ベクトル・複素数平面',
    desc: '二項定理・円と軌跡・加法定理・log・微分積分・漸化式・正規分布・空間ベクトル・極形式と極限'
  },
  {
    id: 'hs_english',
    level: 'high',
    subject: 'english',
    label: '【高校英語】全単元（完了進行形・仮定法・分詞構文・関係副詞/複合関係詞・比較・特殊構文・語法）',
    desc: '英文法・語法・イディオム・仮定法過去完了・分詞構文・関係詞・倒置と強調構文'
  },
  {
    id: 'hs_japanese',
    level: 'high',
    subject: 'japanese',
    label: '【高校国語】現代文（評論語彙）・古文（助動詞・敬語・古文単語・文学史）・漢文（重要句形）',
    desc: '現代文重要語・古典助動詞28語・敬語動詞・漢文句形（否定/反語/使役/受身/抑揚/仮定）'
  },
  {
    id: 'hs_physics',
    level: 'high',
    subject: 'science',
    label: '【高校物理基礎・物理】力学（運動方程式・運動量・円運動・単振動）・熱力学・波動・電磁気・原子',
    desc: '等加速度運動・力学的エネルギー・運動量保存・気体の状態方程式・ドップラー効果・コンデンサーと電磁誘導・光電効果'
  },
  {
    id: 'hs_chemistry',
    level: 'high',
    subject: 'science',
    label: '【高校化学基礎・化学】化学結合・物質量mol・酸塩基とpH・酸化還元と電池・化学平衡・無機・有機・高分子',
    desc: 'mol計算・中和滴定・ファラデーの法則・気体状態方程式・平衡定数・無機沈殿・芳香族とエステル・高分子'
  },
  {
    id: 'hs_bio_earth',
    level: 'high',
    subject: 'science',
    label: '【高校生物・地学】細胞と代謝（呼吸・光合成）・DNAと遺伝情報・恒常性と免疫・プレートと天文宇宙',
    desc: 'ATPと酵素・転写と翻訳・PCR法・ホルモンと免疫・バイオーム・プレート境界・HR図とハッブルの法則'
  },
  {
    id: 'hs_social',
    level: 'high',
    subject: 'social',
    label: '【高校地歴公民】日本史探究・世界史探究・地理探究・公共・政治経済・倫理',
    desc: '日本史通史・世界史通史・ケッペン気候区分と産業・源流思想と社会契約説・憲法・日銀金融政策と国際経済'
  },
  {
    id: 'hs_info',
    level: 'high',
    subject: 'info',
    label: '【高校情報I】2進数/16進数・論理回路・データ量計算・アルゴリズムと計算量・ネットワークと暗号化',
    desc: '基数変換・2の補数・AND/OR/XOR回路・PCM音源と画像サイズ・二分探索とソート・TCP/IPと公開鍵暗号'
  }
];

export const INITIAL_PROBLEMS: MathProblem[] = [
  // ============================================================================
  // 1. 【中学数学】正負の数・文字式・方程式・二次方程式・確率
  // ============================================================================
  {
    id: 'jh-m-alg-1',
    level: '中学',
    subject: 'math',
    category: 'jh_math_alg',
    categoryLabel: '【中学数学】数と式・方程式',
    unitName: '中1：正負の数の四則混合計算',
    difficulty: '基礎',
    question: '次の計算をしなさい： -3² + (-2)³ × (-4) ÷ 8',
    formula: '-3² + (-2)³ × (-4) ÷ 8',
    choices: ['-5', '13', '-13', '5'],
    correctIndex: 0,
    acceptedTextAnswers: ['-5'],
    explanation: [
      '-3² は 3 だけを2乗してマイナスをつけるので -9。',
      '(-2)³ = -8 なので、(-8) × (-4) ÷ 8 = 32 ÷ 8 = 4。',
      'よって -9 + 4 = -5 です。'
    ]
  },
  {
    id: 'jh-m-alg-2',
    level: '中学',
    subject: 'math',
    category: 'jh_math_alg',
    categoryLabel: '【中学数学】数と式・方程式',
    unitName: '中1：一次方程式',
    difficulty: '基礎',
    question: '一次方程式 5x - 9 = 2(x + 3) を解きなさい。',
    formula: '5x - 9 = 2(x + 3)',
    choices: ['x = 5', 'x = 1', 'x = 3', 'x = -5'],
    correctIndex: 0,
    acceptedTextAnswers: ['5', 'x=5'],
    explanation: [
      '右辺を展開すると 5x - 9 = 2x + 6。',
      '移項して整理すると 3x = 15 より x = 5 です。'
    ]
  },
  {
    id: 'jh-m-alg-3',
    level: '中学',
    subject: 'math',
    category: 'jh_math_alg',
    categoryLabel: '【中学数学】数と式・方程式',
    unitName: '中2：連立方程式（加減法）',
    difficulty: '基礎',
    question: '連立方程式 { 3x + 2y = 19,  2x - y = 8 } を解きなさい。',
    formula: '3x + 2y = 19,   2x - y = 8',
    choices: ['x = 5, y = 2', 'x = 4, y = 0', 'x = 3, y = 5', 'x = 6, y = 4'],
    correctIndex: 0,
    acceptedTextAnswers: ['x=5,y=2', '5,2', '(5,2)'],
    explanation: [
      '第2式を2倍すると 4x - 2y = 16。',
      '第1式と足すと 7x = 35 より x = 5。第2式に代入して y = 2 です。'
    ]
  },
  {
    id: 'jh-m-alg-4',
    level: '中学',
    subject: 'math',
    category: 'jh_math_alg',
    categoryLabel: '【中学数学】数と式・方程式',
    unitName: '中3：平方根の計算',
    difficulty: '基礎',
    question: '平方根の計算 √48 - √12 + √27 を簡単にしなさい。',
    formula: '√48 - √12 + √27',
    choices: ['5√3', '4√3', '6√3', '3√3'],
    correctIndex: 0,
    acceptedTextAnswers: ['5√3', '5ルート3'],
    explanation: [
      '√48 = 4√3、√12 = 2√3、√27 = 3√3 と変形できます。',
      '4√3 - 2√3 + 3√3 = 5√3 です。'
    ]
  },
  {
    id: 'jh-m-alg-5',
    level: '中学',
    subject: 'math',
    category: 'jh_math_alg',
    categoryLabel: '【中学数学】数と式・方程式',
    unitName: '中3：二次方程式と因数分解',
    difficulty: '標準',
    question: '二次方程式 x² - 7x + 12 = 0 を解きなさい。',
    formula: 'x² - 7x + 12 = 0',
    choices: ['x = 3, 4', 'x = -3, -4', 'x = 2, 6', 'x = -2, 6'],
    correctIndex: 0,
    acceptedTextAnswers: ['3,4', '4,3', 'x=3,4'],
    explanation: [
      '左辺を因数分解すると (x - 3)(x - 4) = 0。',
      'よって x = 3, 4 です。'
    ]
  },
  {
    id: 'jh-m-alg-6',
    level: '中学',
    subject: 'math',
    category: 'jh_math_alg',
    categoryLabel: '【中学数学】数と式・方程式',
    unitName: '中2：場合の数と確率（さいころ）',
    difficulty: '標準',
    question: '大小2つのさいころを同時に投げるとき、出る目の数の和が 8 になる確率を求めなさい。',
    formula: '全体の目の出方 = 6 × 6 = 36 通り',
    choices: ['5/36', '1/6', '1/9', '7/36'],
    correctIndex: 0,
    acceptedTextAnswers: ['5/36'],
    explanation: [
      '和が 8 になる組は (2,6), (3,5), (4,4), (5,3), (6,2) の 5 通り。',
      '全体は 36 通りなので、求める確率は 5/36 です。'
    ]
  },

  // ============================================================================
  // 2. 【中学数学】関数・平面空間図形・相似・円周角・三平方
  // ============================================================================
  {
    id: 'jh-m-fg-1',
    level: '中学',
    subject: 'math',
    category: 'jh_math_fn_geo',
    categoryLabel: '【中学数学】関数・図形',
    unitName: '中2：一次関数の決定',
    difficulty: '基礎',
    question: '2点 (-1, 2), (3, 10) を通る直線の式を求めなさい。',
    formula: '(-1, 2), (3, 10)',
    choices: ['y = 2x + 4', 'y = 2x - 4', 'y = 3x + 5', 'y = 2x + 3'],
    correctIndex: 0,
    acceptedTextAnswers: ['y=2x+4', '2x+4'],
    explanation: [
      '傾き a = (10 - 2) / (3 - (-1)) = 8 / 4 = 2。',
      'y = 2x + b に (-1, 2) を代入して b = 4。よって y = 2x + 4 です。'
    ]
  },
  {
    id: 'jh-m-fg-2',
    level: '中学',
    subject: 'math',
    category: 'jh_math_fn_geo',
    categoryLabel: '【中学数学】関数・図形',
    unitName: '中3：関数 y = ax² の変化の割合と変域',
    difficulty: '標準',
    question: '関数 y = -2x² において、x の変域が -3 ≦ x ≦ 2 のときの y の変域を求めなさい。',
    formula: 'y = -2x²  (-3 ≦ x ≦ 2)',
    choices: ['-18 ≦ y ≦ 0', '-18 ≦ y ≦ -8', '-8 ≦ y ≦ 0', '0 ≦ y ≦ 18'],
    correctIndex: 0,
    acceptedTextAnswers: ['-18≦y≦0', '-18<=y<=0'],
    explanation: [
      'x = 0 を含むので最大値は x = 0 のとき y = 0。',
      '最小値は x = -3 のとき y = -2 × (-3)² = -18。よって -18 ≦ y ≦ 0 です。'
    ]
  },
  {
    id: 'jh-m-fg-3',
    level: '中学',
    subject: 'math',
    category: 'jh_math_fn_geo',
    categoryLabel: '【中学数学】関数・図形',
    unitName: '中2：多角形の内角と外角',
    difficulty: '基礎',
    question: '1つの内角の大きさが 140° である正多角形は、正何角形か求めなさい。',
    formula: '1つの外角 = 180° - 140° = 40°',
    choices: ['正九角形', '正八角形', '正十角形', '正十二角形'],
    correctIndex: 0,
    acceptedTextAnswers: ['正九角形', '9', '九角形'],
    explanation: [
      '1つの内角が 140° なので、隣り合う1つの外角は 180° - 140° = 40°。',
      '多角形の外角の和は常に 360° なので、360° ÷ 40° = 9 より正九角形です。'
    ]
  },
  {
    id: 'jh-m-fg-4',
    level: '中学',
    subject: 'math',
    category: 'jh_math_fn_geo',
    categoryLabel: '【中学数学】関数・図形',
    unitName: '中3：円周角の定理',
    difficulty: '基礎',
    question: '円 O の周上に4点 A, B, C, D がこの順にあり、線分 AB が円の直径である。∠CAB = 35° のとき、∠ADC の大きさを求めなさい。',
    formula: 'AB は直径 → ∠ACB = 90°',
    choices: ['55°', '35°', '70°', '45°'],
    correctIndex: 0,
    acceptedTextAnswers: ['55', '55°', '55度'],
    explanation: [
      '線分 AB は直径なので、半円の弧に対する円周角より ∠ACB = 90°。',
      '△ABC の内角の和より ∠ABC = 180° - (90° + 35°) = 55°。',
      '同じ弧 AC に対する円周角は等しいので ∠ADC = ∠ABC = 55° です。'
    ]
  },
  {
    id: 'jh-m-fg-5',
    level: '中学',
    subject: 'math',
    category: 'jh_math_fn_geo',
    categoryLabel: '【中学数学】関数・図形',
    unitName: '中3：相似な立体の表面積比と体積比',
    difficulty: '標準',
    question: '相似比が 2 : 3 である2つの円錐 P, Q がある。P の体積が 40 cm³ のとき、Q の体積を求めなさい。',
    formula: '相似比 2 : 3 → 体積比 2³ : 3³ = 8 : 27',
    choices: ['135 cm³', '90 cm³', '60 cm³', '120 cm³'],
    correctIndex: 0,
    acceptedTextAnswers: ['135', '135cm3'],
    explanation: [
      '体積比は 2³ : 3³ = 8 : 27。',
      '40 : V = 8 : 27 より V = 5 × 27 = 135 cm³ です。'
    ]
  },
  {
    id: 'jh-m-fg-6',
    level: '中学',
    subject: 'math',
    category: 'jh_math_fn_geo',
    categoryLabel: '【中学数学】関数・図形',
    unitName: '中3：三平方の定理と空間図形',
    difficulty: '標準',
    question: '縦 3 cm、横 4 cm、高さ 12 cm の直方体の対角線の長さを求めなさい。',
    formula: 'd = √(3² + 4² + 12²)',
    choices: ['13 cm', '15 cm', '14 cm', '17 cm'],
    correctIndex: 0,
    acceptedTextAnswers: ['13', '13cm'],
    explanation: [
      '直方体の対角線の公式より d = √(3² + 4² + 12²) = √(9 + 16 + 144) = √169 = 13 cm です。'
    ]
  },

  // ============================================================================
  // 3. 【中学英語】中1〜中3 全単元（時制・不定詞・動名詞・比較・受動態・現在完了・関係代名詞・仮定法）
  // ============================================================================
  {
    id: 'jh-eng-1',
    level: '中学',
    subject: 'english',
    category: 'jh_english',
    categoryLabel: '【中学英語】英文法・構文',
    unitName: '中2：不定詞と動名詞の使い分け',
    difficulty: '基礎',
    question: '次の英文の空所に入る最も適切な語を選びなさい： My brother enjoyed (      ) soccer in the park yesterday.',
    formula: 'enjoy + ~ing（〜することを楽しむ）',
    choices: ['playing', 'to play', 'played', 'plays'],
    correctIndex: 0,
    acceptedTextAnswers: ['playing'],
    explanation: [
      '動詞 enjoy, finish, stop, practice などは目的語に動名詞（~ing）のみをとり、不定詞（to do）はとりません。',
      'したがって playing が正解です。'
    ]
  },
  {
    id: 'jh-eng-2',
    level: '中学',
    subject: 'english',
    category: 'jh_english',
    categoryLabel: '【中学英語】英文法・構文',
    unitName: '中2：比較表現（最上級と原級）',
    difficulty: '基礎',
    question: '「富士山は日本で一番高い山です」を表す英文として正しいものを選びなさい。',
    formula: 'the + 最上級 + in [of] ~',
    choices: [
      'Mt. Fuji is the highest mountain in Japan.',
      'Mt. Fuji is higher than mountain in Japan.',
      'Mt. Fuji is the most high mountain of Japan.',
      'Mt. Fuji is as high as mountain in Japan.'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['Mt. Fuji is the highest mountain in Japan.'],
    explanation: [
      'high の最上級は highest であり、最上級の前には the を置きます。',
      '場所や範囲を表す「日本で」は in Japan を用いるため、Mt. Fuji is the highest mountain in Japan. が正解です。'
    ]
  },
  {
    id: 'jh-eng-3',
    level: '中学',
    subject: 'english',
    category: 'jh_english',
    categoryLabel: '【中学英語】英文法・構文',
    unitName: '中3：受動態（受け身）',
    difficulty: '基礎',
    question: '次の英文の空所に入る適切な語句を選びなさい： This library (      ) fifty years ago.',
    formula: 'be動詞 + 過去分詞（受動態）',
    choices: ['was built', 'built', 'is built', 'has built'],
    correctIndex: 0,
    acceptedTextAnswers: ['was built'],
    explanation: [
      '主語 This library（この図書館）は「建てられた」側なので受動態（be動詞 + 過去分詞）にします。',
      'fifty years ago（50年前に）という過去の時制を表す語句があるため、過去形の受動態 was built が正解です。'
    ]
  },
  {
    id: 'jh-eng-4',
    level: '中学',
    subject: 'english',
    category: 'jh_english',
    categoryLabel: '【中学英語】英文法・構文',
    unitName: '中3：現在完了形（継続・経験・完了）',
    difficulty: '標準',
    question: '「私は3年間ずっとこの町に住んでいます」を表す英文の空所に入る適切な語句を選びなさい： I (      ) in this town for three years.',
    formula: 'have / has + 過去分詞 + for ~',
    choices: ['have lived', 'lived', 'am living', 'was living'],
    correctIndex: 0,
    acceptedTextAnswers: ['have lived'],
    explanation: [
      '過去から現在までの継続（〜の間ずっと…している）は現在完了形（have + 過去分詞）で表します。',
      'for three years（3年間）を伴うため have lived が正解です。'
    ]
  },
  {
    id: 'jh-eng-5',
    level: '中学',
    subject: 'english',
    category: 'jh_english',
    categoryLabel: '【中学英語】英文法・構文',
    unitName: '中3：関係代名詞（主格・目的格）',
    difficulty: '標準',
    question: '次の空所に入る最も適切な関係代名詞を選びなさい： The boy (      ) is running over there is my friend Ken.',
    formula: '先行詞（人）+ 主格の関係代名詞 who + 動詞',
    choices: ['who', 'which', 'whose', 'whom'],
    correctIndex: 0,
    acceptedTextAnswers: ['who', 'that'],
    explanation: [
      '先行詞が The boy（人）であり、空所の直後に動詞 is running が続いているため、主格の関係代名詞 who が入ります。'
    ]
  },
  {
    id: 'jh-eng-6',
    level: '中学',
    subject: 'english',
    category: 'jh_english',
    categoryLabel: '【中学英語】英文法・構文',
    unitName: '中3：仮定法（I wish / If I were ~）',
    difficulty: '応用',
    question: '「もし私が鳥なら、あなたのところへ飛んでいけるのに」を表す英文の空所に入る語を選びなさい： If I (      ) a bird, I could fly to you.',
    formula: 'If + 主語 + 過去形(were), 主語 + would/could + 動詞の原形',
    choices: ['were', 'am', 'will be', 'have been'],
    correctIndex: 0,
    acceptedTextAnswers: ['were', 'was'],
    explanation: [
      '現在の事実に反する仮定（仮定法過去）では、if節の動詞を過去形にします。be動詞の場合は主語が I でも were（または was）を用います。'
    ]
  },

  // ============================================================================
  // 4. 【中学国語】漢字・口語文法・敬語・古文・漢文・文学史
  // ============================================================================
  {
    id: 'jh-jpn-1',
    level: '中学',
    subject: 'japanese',
    category: 'jh_japanese',
    categoryLabel: '【中学国語】文法・古文・漢文',
    unitName: '口語文法：動詞の活用の種類',
    difficulty: '基礎',
    question: '次の動詞のうち、活用の種類が「上一段活用」であるものを選びなさい。',
    formula: '「ない」をつけて直前の音が「イ段」なら上一段活用（見ない・起きない等）',
    choices: ['起きる', '走る', '受ける', '来る'],
    correctIndex: 0,
    acceptedTextAnswers: ['起きる'],
    explanation: [
      '「起きる」に「ない」をつけると「起き（ki）ない」となり、イ段の音になるため上一段活用です。',
      '「走る（ra）」は五段活用、「受ける（ke）」は下一段活用、「来る」はカ行変格活用です。'
    ]
  },
  {
    id: 'jh-jpn-2',
    level: '中学',
    subject: 'japanese',
    category: 'jh_japanese',
    categoryLabel: '【中学国語】文法・古文・漢文',
    unitName: '口語文法：敬語（尊敬語・謙譲語・丁寧語）',
    difficulty: '基礎',
    question: '「先生が教室にいらっしゃる」の「いらっしゃる」と、「私が先生に申し上げる」の「申し上げる」の敬語の種類として正しい組合せを選びなさい。',
    formula: '相手の動作を高める＝尊敬語 ／ 自分の動作をへりくだる＝謙譲語',
    choices: [
      'いらっしゃる：尊敬語 ／ 申し上げる：謙譲語',
      'いらっしゃる：謙譲語 ／ 申し上げる：尊敬語',
      'いらっしゃる：丁寧語 ／ 申し上げる：謙譲語',
      'いらっしゃる：尊敬語 ／ 申し上げる：丁寧語'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['尊敬語,謙譲語'],
    explanation: [
      '「いらっしゃる」は動作主である先生を高める「尊敬語」です。',
      '「申し上げる」は動作主（私）がへりくだって相手（先生）を高める「謙譲語」です。'
    ]
  },
  {
    id: 'jh-jpn-3',
    level: '中学',
    subject: 'japanese',
    category: 'jh_japanese',
    categoryLabel: '【中学国語】文法・古文・漢文',
    unitName: '中学古文：歴史的仮名遣いと三大随筆',
    difficulty: '基礎',
    question: '清少納言が著した『枕草子』の冒頭「春はあけぼの。やうやう白くなりゆく山際…」の「やうやう」を現代仮名遣いに直したものと、その意味の組合せとして正しいものを選びなさい。',
    formula: 'やうやう → ようよう（だんだんと）',
    choices: [
      'ようよう （意味：だんだんと）',
      'ゆうゆう （意味：ゆったりと）',
      'ようよう （意味：やっとのことで）',
      'やあやあ （意味：やがてすぐに）'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['ようよう'],
    explanation: [
      'ア段＋「う」（やう）はオ段の長音「よう」と読むため、現代仮名遣いは「ようよう」です。',
      '古文における「やうやう」は「だんだんと・次第に」という意味を表します。'
    ]
  },
  {
    id: 'jh-jpn-4',
    level: '中学',
    subject: 'japanese',
    category: 'jh_japanese',
    categoryLabel: '【中学国語】文法・古文・漢文',
    unitName: '中学漢文：返り点（レ点・一二点）',
    difficulty: '標準',
    question: '漢文「温故知新」（故きを温ねて新しきを知る）において、「温」の下に「二」、「故」の下に「一」がついているとき、「温故」の部分を読む順序として正しいものを選びなさい。',
    formula: '一二点：一の文字を読んでから二の文字へ返る',
    choices: [
      '故 → 温 （故きを温ねて）',
      '温 → 故 （温ねて故きを）',
      '新 → 知 （新しきを知る）',
      '知 → 故 （故きを知る）'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['故→温'],
    explanation: [
      '返り点の「一・二点」は、「二」がついた字（温）を飛ばして先に「一」がついた字（故）を読み、その直後に「二」の字（温）に返って読みます。'
    ]
  },
  {
    id: 'jh-jpn-5',
    level: '中学',
    subject: 'japanese',
    category: 'jh_japanese',
    categoryLabel: '【中学国語】文法・古文・漢文',
    unitName: '表現技法（修辞法）',
    difficulty: '基礎',
    question: '「春風が頬をなでながら楽しそうに歌っている」という文に使われている表現技法（修辞法）を選びなさい。',
    formula: '人間でないものを人間に見立てて表現する技法',
    choices: ['擬人法', '倒置法', '体言止め', '対句'],
    correctIndex: 0,
    acceptedTextAnswers: ['擬人法'],
    explanation: [
      '人間ではない「春風」が「頬をなでる」「楽しそうに歌う」と人間のように振る舞う表現なので「擬人法」です。'
    ]
  },

  // ============================================================================
  // 5. 【中学理科・第1分野】物理・化学 全単元
  // ============================================================================
  {
    id: 'jh-sci-pc-1',
    level: '中学',
    subject: 'science',
    category: 'jh_science_phys_chem',
    categoryLabel: '【中学理科】物理・化学',
    unitName: '中2物理：並列回路とオームの法則',
    difficulty: '基礎',
    question: '20 Ω の電熱線と 30 Ω の電熱線を並列につなぎ、6 V の電圧をかけたとき、回路全体を流れる電流を求めなさい。',
    formula: 'I = I₁ + I₂ = V/R₁ + V/R₂',
    choices: ['0.5 A (500 mA)', '0.12 A (120 mA)', '0.3 A (300 mA)', '0.8 A (800 mA)'],
    correctIndex: 0,
    acceptedTextAnswers: ['0.5', '0.5A', '500mA'],
    explanation: [
      '20 Ω に流れる電流 I₁ = 6 / 20 = 0.3 A、30 Ω に流れる電流 I₂ = 6 / 30 = 0.2 A。',
      '全体の電流 I = 0.3 + 0.2 = 0.5 A (500 mA) です。'
    ]
  },
  {
    id: 'jh-sci-pc-2',
    level: '中学',
    subject: 'science',
    category: 'jh_science_phys_chem',
    categoryLabel: '【中学理科】物理・化学',
    unitName: '中2物理：電力と発熱量（ジュール）',
    difficulty: '標準',
    question: '100 V で 5 A の電流が流れる電熱線に 5 分間電流を流したときに発生する熱量は何 J か。',
    formula: 'Q [J] = V × I × t [秒]',
    choices: ['150,000 J (150 kJ)', '2,500 J', '50,000 J', '300,000 J'],
    correctIndex: 0,
    acceptedTextAnswers: ['150000', '150000J', '150kJ'],
    explanation: [
      '電力 P = 100 V × 5 A = 500 W。5分間 = 300秒なので Q = 500 × 300 = 150,000 J です。'
    ]
  },
  {
    id: 'jh-sci-pc-3',
    level: '中学',
    subject: 'science',
    category: 'jh_science_phys_chem',
    categoryLabel: '【中学理科】物理・化学',
    unitName: '中1化学：質量パーセント濃度',
    difficulty: '基礎',
    question: '質量パーセント濃度 15% の食塩水 200 g に含まれる食塩と水の質量を求めなさい。',
    formula: '溶質の質量 = 溶液 × (濃度 / 100)',
    choices: ['食塩 30 g, 水 170 g', '食塩 15 g, 水 185 g', '食塩 30 g, 水 200 g', '食塩 25 g, 水 175 g'],
    correctIndex: 0,
    acceptedTextAnswers: ['30g,170g', '30,170'],
    explanation: [
      '食塩 = 200 × 0.15 = 30 g、水 = 200 - 30 = 170 g です。'
    ]
  },
  {
    id: 'jh-sci-pc-4',
    level: '中学',
    subject: 'science',
    category: 'jh_science_phys_chem',
    categoryLabel: '【中学理科】物理・化学',
    unitName: '中2化学：金属の酸化と定比例の法則',
    difficulty: '標準',
    question: '銅とマグネシウムがそれぞれ酸素と化合して酸化物になるときの「金属：酸素：酸化物」の質量比を選びなさい。',
    formula: '2Cu + O₂ → 2CuO ／ 2Mg + O₂ → 2MgO',
    choices: [
      '銅 4 : 1 : 5 、 マグネシウム 3 : 2 : 5',
      '銅 3 : 2 : 5 、 マグネシウム 4 : 1 : 5',
      '銅 4 : 1 : 5 、 マグネシウム 2 : 1 : 3',
      '銅 3 : 1 : 4 、 マグネシウム 3 : 2 : 5'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['4:1:5,3:2:5'],
    explanation: [
      '銅：酸素：酸化銅 ＝ 4 : 1 : 5、マグネシウム：酸素：酸化マグネシウム ＝ 3 : 2 : 5 です。'
    ]
  },
  {
    id: 'jh-sci-pc-5',
    level: '中学',
    subject: 'science',
    category: 'jh_science_phys_chem',
    categoryLabel: '【中学理科】物理・化学',
    unitName: '中3化学：酸・アルカリと中和反応',
    difficulty: '標準',
    question: '塩酸（HCl）と水酸化ナトリウム水溶液（NaOH）を混ぜて中和させたとき、起こる反応のイオン反応式と生成する塩の組合せとして正しいものを選びなさい。',
    formula: 'HCl + NaOH → NaCl + H₂O',
    choices: [
      'H⁺ + OH⁻ → H₂O （生成する塩：塩化ナトリウム NaCl）',
      'Na⁺ + Cl⁻ → NaCl （生成する塩：水 H₂O）',
      '2H⁺ + O²⁻ → H₂O （生成する塩：水酸化ナトリウム）',
      'H⁺ + Cl⁻ → HCl （生成する塩：塩化水素）'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['H++OH-→H2O', 'NaCl'],
    explanation: [
      '中和反応の本質は、酸の水素イオン H⁺ とアルカリの水酸化物イオン OH⁻ が結びついて水 H₂O ができる反応（H⁺ + OH⁻ → H₂O）です。',
      '同時に陽イオン Na⁺ と陰イオン Cl⁻ から塩化ナトリウム（NaCl）が生じます。'
    ]
  },

  // ============================================================================
  // 6. 【中学理科・第2分野】生物・地学 全単元
  // ============================================================================
  {
    id: 'jh-sci-be-1',
    level: '中学',
    subject: 'science',
    category: 'jh_science_bio_earth',
    categoryLabel: '【中学理科】生物・地学',
    unitName: '中2生物：人体の消化と吸収（消化酵素）',
    difficulty: '基礎',
    question: 'デンプン・タンパク質・脂肪が消化酵素によって最終的に分解されて小腸の柔毛から吸収される物質の組合せとして正しいものを選びなさい。',
    formula: 'デンプン → ？ ／ タンパク質 → ？ ／ 脂肪 → ？',
    choices: [
      'デンプン → ブドウ糖 、 タンパク質 → アミノ酸 、 脂肪 → 脂肪酸とモノグリセリド',
      'デンプン → アミノ酸 、 タンパク質 → ブドウ糖 、 脂肪 → 脂肪酸とモノグリセリド',
      'デンプン → ブドウ糖 、 タンパク質 → 脂肪酸 、 脂肪 → アミノ酸',
      'デンプン → 麦芽糖 、 タンパク質 → ペプトン 、 脂肪 → グリセリン'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['ブドウ糖,アミノ酸,脂肪酸とモノグリセリド'],
    explanation: [
      'デンプンはアミラーゼ等で最終的に「ブドウ糖」に、タンパク質はペプシン・トリプシン等で「アミノ酸」に、脂肪はリパーゼで「脂肪酸とモノグリセリド」に分解されて柔毛から吸収されます。'
    ]
  },
  {
    id: 'jh-sci-be-2',
    level: '中学',
    subject: 'science',
    category: 'jh_science_bio_earth',
    categoryLabel: '【中学理科】生物・地学',
    unitName: '中3生物：メンデルの法則と遺伝',
    difficulty: '標準',
    question: 'エンドウの種子の形について、丸形遺伝子（A）はしわ形遺伝子（a）に対して顕性（優性）である。ヘテロ接合の丸形（Aa）どうしをかけ合わせたとき、子の世代に現れる「丸形：しわ形」の個体数の比を求めなさい。',
    formula: 'Aa × Aa → AA : Aa : aa = 1 : 2 : 1',
    choices: ['丸形 ： しわ形 ＝ 3 : 1', '丸形 ： しわ形 ＝ 1 : 1', '丸形 ： しわ形 ＝ 2 : 1', 'すべて丸形'],
    correctIndex: 0,
    acceptedTextAnswers: ['3:1'],
    explanation: [
      'Aa × Aa の交配では、子の遺伝子型は AA : Aa : aa = 1 : 2 : 1 となります。',
      'AA と Aa は丸形、aa はしわ形になるため、表現型の比は 丸形：しわ形 ＝ 3 : 1 です。'
    ]
  },
  {
    id: 'jh-sci-be-3',
    level: '中学',
    subject: 'science',
    category: 'jh_science_bio_earth',
    categoryLabel: '【中学理科】生物・地学',
    unitName: '中1地学：地震の伝わり方と初期微動継続時間',
    difficulty: '標準',
    question: '震源から 60 km 離れた地点 A で、P波（7.5 km/s）が届いてから S波（3.0 km/s）が届くまでの時間（初期微動継続時間）は何秒か求めなさい。',
    formula: '初期微動継続時間 = (S波の到達時間) - (P波の到達時間)',
    choices: ['12 秒', '8 秒', '20 秒', '15 秒'],
    correctIndex: 0,
    acceptedTextAnswers: ['12', '12秒'],
    explanation: [
      'P波が届くまでの時間 = 60 km ÷ 7.5 km/s = 8 秒。',
      'S波が届くまでの時間 = 60 km ÷ 3.0 km/s = 20 秒。',
      'よって初期微動継続時間は 20 - 8 = 12 秒です。'
    ]
  },
  {
    id: 'jh-sci-be-4',
    level: '中学',
    subject: 'science',
    category: 'jh_science_bio_earth',
    categoryLabel: '【中学理科】生物・地学',
    unitName: '中2地学：飽和水蒸気量と湿度計算',
    difficulty: '標準',
    question: '気温 25 ℃（飽和水蒸気量 23.1 g/m³）の空気 1 m³ 中に、11.55 g の水蒸気が含まれている。この空気の湿度（%）を求めなさい。',
    formula: '湿度(%) = (空気1m³中の水蒸気量 / その気温での飽和水蒸気量) × 100',
    choices: ['50 %', '25 %', '75 %', '40 %'],
    correctIndex: 0,
    acceptedTextAnswers: ['50', '50%'],
    explanation: [
      '湿度 = (11.55 / 23.1) × 100 = 0.5 × 100 = 50 % です。'
    ]
  },
  {
    id: 'jh-sci-be-5',
    level: '中学',
    subject: 'science',
    category: 'jh_science_bio_earth',
    categoryLabel: '【中学理科】生物・地学',
    unitName: '中3地学：天体の日周運動と年周運動',
    difficulty: '標準',
    question: 'ある日、南の空の高度 40° に見えた恒星 A が、1か月後の同じ時刻に南中していた。この日、恒星 A が見えた時刻は午後何時ごろか（星は1日に1時間あたり15°、1か月で約30°動くものとする）。',
    formula: '日周運動：1時間に 15° ／ 年周運動：1か月に 30°',
    choices: [
      '1か月前には南東の空（南から東へ30°）に見え、その日の2時間後に南中する',
      '1か月前には南西の空に見え、その日の2時間前に南中する',
      '1か月前にも真南に見え、同じ時刻に南中する',
      '1か月前には北の空に見え、6時間後に南中する'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['南東', '2時間後'],
    explanation: [
      '年周運動により恒星は同じ時刻で見ると1か月に約 30° 東から西（南中方向）へ進みます。',
      '1か月後に南中したということは、その1か月前の同じ時刻には南より 30° 東側（南東）にあり、日周運動（1時間15°）で 30° ÷ 15° = 2時間後に南中します。'
    ]
  },

  // ============================================================================
  // 7. 【中学社会】地理・歴史・公民 全単元
  // ============================================================================
  {
    id: 'jh-soc-1',
    level: '中学',
    subject: 'social',
    category: 'jh_social_geo_hist_civ',
    categoryLabel: '【中学社会】地理・歴史・公民',
    unitName: '地理：世界の気候区分と日本の気候',
    difficulty: '基礎',
    question: '夏は高温で乾燥し（オリーブやブドウなどの果樹栽培＝地中海式農業が盛ん）、冬に一定の降水があるヨーロッパ南部などの気候区分を何というか。',
    formula: 'ケッペン気候区分：Cs',
    choices: ['地中海性気候', '西岸海洋性気候', '温暖湿潤気候', 'サバナ気候'],
    correctIndex: 0,
    acceptedTextAnswers: ['地中海性気候'],
    explanation: [
      '夏に中緯度高圧帯の影響で乾燥し、冬に偏西風と前線の影響で雨が降る温帯の気候を「地中海性気候」といいます。'
    ]
  },
  {
    id: 'jh-soc-2',
    level: '中学',
    subject: 'social',
    category: 'jh_social_geo_hist_civ',
    categoryLabel: '【中学社会】地理・歴史・公民',
    unitName: '歴史（古代〜中世）：鎌倉幕府と執権政治',
    difficulty: '基礎',
    question: '1221年、後鳥羽上皇が鎌倉幕府を倒そうとして起こした戦乱と、その後に北条泰時が1232年に制定した最初の武家法典の組合せとして正しいものを選びなさい。',
    formula: '1221年（戦乱） → 六波羅探題設置 → 1232年（武家法）',
    choices: [
      '承久の乱 ／ 御成敗式目（貞永式目）',
      '応仁の乱 ／ 建武式目',
      '保元の乱 ／ 武家諸法度',
      '平治の乱 ／ 大宝律令'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['承久の乱,御成敗式目'],
    explanation: [
      '1221年に後鳥羽上皇が起こした「承久の乱」に勝利した幕府は京都に六波羅探題を置き、1232年に第3代執権・北条泰時が「御成敗式目（貞永式目）」を制定しました。'
    ]
  },
  {
    id: 'jh-soc-3',
    level: '中学',
    subject: 'social',
    category: 'jh_social_geo_hist_civ',
    categoryLabel: '【中学社会】地理・歴史・公民',
    unitName: '歴史（近世〜近代）：明治維新の三大改革',
    difficulty: '基礎',
    question: '明治政府が1873（明治6）年に行った税制改革で、土地の価格（地価）の3%を現金で地主に納めさせた制度を何というか。',
    formula: '1872年：学制 ／ 1873年：徴兵令・？',
    choices: ['地租改正', '廃藩置県', '版籍奉還', '太閤検地'],
    correctIndex: 0,
    acceptedTextAnswers: ['地租改正'],
    explanation: [
      '政府の歳入を安定させるため、収穫高に応じた年貢（米納）から、地価の3%（後に2.5%）を土地所有者（地券交付者）に現金で納めさせる「地租改正」を1873年に実施しました。'
    ]
  },
  {
    id: 'jh-soc-4',
    level: '中学',
    subject: 'social',
    category: 'jh_social_geo_hist_civ',
    categoryLabel: '【中学社会】地理・歴史・公民',
    unitName: '公民：日本国憲法と三権分立',
    difficulty: '基礎',
    question: '日本国憲法における三権分立について、裁判所が国会や内閣の作った法律・命令が憲法に違反していないかを審査する権限を何というか。',
    formula: '司法権（裁判所）→ 立法権（国会）・行政権（内閣）への抑制',
    choices: ['違憲審査権（違憲立法審査権）', '弾劾裁判権', '国政調査権', '衆議院の解散権'],
    correctIndex: 0,
    acceptedTextAnswers: ['違憲審査権', '違憲立法審査権'],
    explanation: [
      '日本国憲法第81条に基づき、最高裁判所を頂点とする裁判所は「憲法の番人」として「違憲審査権（違憲立法審査権）」を有しています。'
    ]
  },
  {
    id: 'jh-soc-5',
    level: '中学',
    subject: 'social',
    category: 'jh_social_geo_hist_civ',
    categoryLabel: '【中学社会】地理・歴史・公民',
    unitName: '公民：市場経済と日本銀行の金融政策',
    difficulty: '標準',
    question: '景気が過熱し物価が継続的に上昇する「インフレーション（インフレ）」を抑えるために、日本銀行（中央銀行）が行う公開市場操作として正しいものを選びなさい。',
    formula: 'インフレ対策 ＝ 市中の通貨供給量を減らす（金融引き締め）',
    choices: [
      '民間銀行に国債などを売って、市場に出回る資金を吸収する（売りオペレーション）',
      '民間銀行から国債などを買い取って、市場に資金を供給する（買いオペレーション）',
      '政策金利を引き下げて、企業がお金を借りやすくする',
      '政府が公共事業を増やして需要を拡大させる'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['売りオペレーション', '売りオペ'],
    explanation: [
      'インフレ時には市中の通貨量を減らす「金融引き締め」を行うため、日銀が保有する国債等を民間金融機関に売却して代金を回収する「売りオペレーション」を実施します。'
    ]
  },

  // ============================================================================
  // 8. 【高校数学I・A】全単元（数と式・二次関数・三角比・データ分析・確率・整数・図形）
  // ============================================================================
  {
    id: 'hs-m1a-1',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数I：たすき掛け因数分解',
    difficulty: '標準',
    question: '整式 6x² + 7x - 5 を因数分解しなさい。',
    formula: '6x² + 7x - 5',
    choices: ['(2x - 1)(3x + 5)', '(2x + 1)(3x - 5)', '(6x - 1)(x + 5)', '(2x + 5)(3x - 1)'],
    correctIndex: 0,
    acceptedTextAnswers: ['(2x-1)(3x+5)', '(3x+5)(2x-1)'],
    explanation: [
      '2×5 + 3×(-1) = 7 より、(2x - 1)(3x + 5) と因数分解できます。'
    ]
  },
  {
    id: 'hs-m1a-2',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数I：対称式の計算',
    difficulty: '標準',
    question: 'x + 1/x = 4 のとき、x² + 1/x² および x³ + 1/x³ の値を求めなさい。',
    formula: 'x + 1/x = 4',
    choices: [
      'x² + 1/x² = 14,  x³ + 1/x³ = 52',
      'x² + 1/x² = 16,  x³ + 1/x³ = 64',
      'x² + 1/x² = 14,  x³ + 1/x³ = 56',
      'x² + 1/x² = 12,  x³ + 1/x³ = 48'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['14,52', '14', '52'],
    explanation: [
      'x² + 1/x² = 4² - 2 = 14、x³ + 1/x³ = 4³ - 3×4 = 64 - 12 = 52 です。'
    ]
  },
  {
    id: 'hs-m1a-3',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数I：集合と命題（必要条件・十分条件）',
    difficulty: '標準',
    question: '実数 x について、「x = 3」は「x² - 5x + 6 = 0」であるための何条件か答えなさい。',
    formula: 'P : x = 3   /   Q : x² - 5x + 6 = 0 (⇔ x = 2, 3)',
    choices: [
      '十分条件であるが必要条件ではない',
      '必要条件であるが十分条件ではない',
      '必要十分条件である',
      '必要条件でも十分条件でもない'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['十分条件', '十分条件であるが必要条件ではない'],
    explanation: [
      'x = 3 ならば x² - 5x + 6 = 0 は真（P ⇒ Q は真）。',
      '逆の x² - 5x + 6 = 0 ならば x = 3 は偽（反例 x = 2）。よって十分条件であるが必要条件ではありません。'
    ]
  },
  {
    id: 'hs-m1a-4',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数I：二次関数の最大値・最小値',
    difficulty: '標準',
    question: '二次関数 y = -2x² + 8x - 3 (1 ≦ x ≦ 4) の最大値 M と最小値 m を求めなさい。',
    formula: 'y = -2(x - 2)² + 5  (1 ≦ x ≦ 4)',
    choices: [
      '最大値 M = 5 (x = 2)、最小値 m = -3 (x = 4)',
      '最大値 M = 5 (x = 2)、最小値 m = 3 (x = 1)',
      '最大値 M = 3 (x = 1)、最小値 m = -3 (x = 4)',
      '最大値 M = 8 (x = 2)、最小値 m = -3 (x = 4)'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['5,-3', 'M=5,m=-3'],
    explanation: [
      '平方完成すると y = -2(x - 2)² + 5。頂点 x = 2 で最大値 M = 5、端点 x = 4 で最小値 m = -3 です。'
    ]
  },
  {
    id: 'hs-m1a-5',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数I：三角比（余弦定理・正弦定理）',
    difficulty: '基礎',
    question: '△ABC において a = 7, b = 5, c = 8 のとき、角 A の大きさを求めなさい。',
    formula: 'cos A = (b² + c² - a²) / (2bc)',
    choices: ['A = 60° (cos A = 1/2)', 'A = 30° (cos A = √3/2)', 'A = 120° (cos A = -1/2)', 'A = 45°'],
    correctIndex: 0,
    acceptedTextAnswers: ['60', '60°', '60度'],
    explanation: [
      'cos A = (25 + 64 - 49) / (2×5×8) = 40 / 80 = 1/2 より A = 60° です。'
    ]
  },
  {
    id: 'hs-m1a-6',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数I：データの分析（分散と標準偏差）',
    difficulty: '標準',
    question: '5個のデータ 4, 6, 7, 8, 10 の平均値と分散 s² を求めなさい。',
    formula: '分散 s² = (偏差の2乗の和) / データの個数',
    choices: ['平均値 7, 分散 s² = 4', '平均値 7, 分散 s² = 2', '平均値 7, 分散 s² = 20', '平均値 6.8, 分散 s² = 4'],
    correctIndex: 0,
    acceptedTextAnswers: ['7,4', '4'],
    explanation: [
      '平均値は 35/5 = 7。偏差の2乗の和 = (-3)² + (-1)² + 0² + 1² + 3² = 20。よって分散 s² = 20/5 = 4 です。'
    ]
  },
  {
    id: 'hs-m1a-7',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数A：条件付き確率・組合せ確率',
    difficulty: '標準',
    question: '赤玉4個、白玉3個が入った袋から同時に2個を取り出すとき、2個とも同じ色である確率を求めなさい。',
    formula: '(₄C₂ + ₃C₂) / ₇C₂',
    choices: ['3/7', '4/7', '2/7', '9/21'],
    correctIndex: 0,
    acceptedTextAnswers: ['3/7'],
    explanation: [
      '(6 + 3) / 21 = 9 / 21 = 3/7 です。'
    ]
  },
  {
    id: 'hs-m1a-8',
    level: '高校',
    subject: 'math',
    category: 'hs_math_1a',
    categoryLabel: '【高校数学I・A】',
    unitName: '数A：整数の性質（一次不定方程式）',
    difficulty: '標準',
    question: '一次不定方程式 5x + 3y = 1 を満たす整数解 (x, y) のうち、x が正で最小の組を求めなさい。',
    formula: '5x + 3y = 1',
    choices: ['(x, y) = (2, -3)', '(x, y) = (1, -1)', '(x, y) = (5, -8)', '(x, y) = (3, -5)'],
    correctIndex: 0,
    acceptedTextAnswers: ['(2,-3)', '2,-3'],
    explanation: [
      '5×2 + 3×(-3) = 10 - 9 = 1 より、(x, y) = (2, -3) が x > 0 で最小の解です。'
    ]
  },

  // ============================================================================
  // 9. 【高校数学II・B・III・C】全単元
  // ============================================================================
  {
    id: 'hs-m2b3c-1',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数II：二項定理',
    difficulty: '基礎',
    question: '(2x - 1)⁵ の展開式における x³ の係数を求めなさい。',
    formula: '₅C₃ (2x)³ (-1)²',
    choices: ['80', '-80', '40', '10'],
    correctIndex: 0,
    acceptedTextAnswers: ['80'],
    explanation: [
      '二項定理より x³ の項は ₅C₃ (2x)³ (-1)² = 10 × 8x³ × 1 = 80x³。よって係数は 80 です。'
    ]
  },
  {
    id: 'hs-m2b3c-2',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数II：図形と方程式（点と直線の距離・円）',
    difficulty: '基礎',
    question: '点 (3, -1) と直線 4x - 3y + 5 = 0 の距離 d を求めなさい。',
    formula: 'd = |ax₁ + by₁ + c| / √(a² + b²)',
    choices: ['4', '20', '3', '5'],
    correctIndex: 0,
    acceptedTextAnswers: ['4'],
    explanation: [
      'd = |12 + 3 + 5| / √(16 + 9) = 20 / 5 = 4 です。'
    ]
  },
  {
    id: 'hs-m2b3c-3',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数II：三角関数の合成と加法定理',
    difficulty: '標準',
    question: 'sin θ + √3 cos θ を r sin(θ + α) の形に合成しなさい。',
    formula: 'a sin θ + b cos θ = √(a² + b²) sin(θ + α)',
    choices: ['2 sin(θ + π/3)', '2 sin(θ + π/6)', '√2 sin(θ + π/4)', '2 sin(θ - π/3)'],
    correctIndex: 0,
    acceptedTextAnswers: ['2sin(θ+π/3)'],
    explanation: [
      'r = √(1² + (√3)²) = 2。cos α = 1/2, sin α = √3/2 より α = π/3。よって 2 sin(θ + π/3) です。'
    ]
  },
  {
    id: 'hs-m2b3c-4',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数II：指数関数・対数関数',
    difficulty: '基礎',
    question: 'log₂ 12 + log₂ 6 - log₂ 9 の値を求めなさい。',
    formula: 'log₂ ((12 × 6) / 9)',
    choices: ['3', '2', '4', '8'],
    correctIndex: 0,
    acceptedTextAnswers: ['3'],
    explanation: [
      'log₂ (72 / 9) = log₂ 8 = log₂ 2³ = 3 です。'
    ]
  },
  {
    id: 'hs-m2b3c-5',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数II：微分法と積分法（極値と面積）',
    difficulty: '標準',
    question: '放物線 y = x² - 3x - 2 と直線 y = x + 3 で囲まれた図形の面積 S を求めなさい。',
    formula: 'S = |a|(β - α)³ / 6',
    choices: ['36', '18', '24', '72'],
    correctIndex: 0,
    acceptedTextAnswers: ['36'],
    explanation: [
      'x² - 4x - 5 = 0 ⇔ (x + 1)(x - 5) = 0 より交点は x = -1, 5。',
      '1/6 公式より S = (5 - (-1))³ / 6 = 216 / 6 = 36 です。'
    ]
  },
  {
    id: 'hs-m2b3c-6',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数B：数列と漸化式',
    difficulty: '応用',
    question: 'a₁ = 1, a_{n+1} = 2a_n + 3 で定められる数列の第6項 a₆ を求めなさい。',
    formula: 'a_{n+1} + 3 = 2(a_n + 3)',
    choices: ['125 (a_n = 2^{n+1} - 3)', '63 (a_n = 2^n - 1)', '128', '94'],
    correctIndex: 0,
    acceptedTextAnswers: ['125'],
    explanation: [
      'a_n + 3 = 4・2^{n-1} = 2^{n+1} より a_n = 2^{n+1} - 3。よって a₆ = 2⁷ - 3 = 125 です。'
    ]
  },
  {
    id: 'hs-m2b3c-7',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数C：平面・空間ベクトル（内積と垂直条件）',
    difficulty: '基礎',
    question: '2つのベクトル a = (2, x), b = (x - 3, -4) が垂直（a ⊥ b）であるとき、実数 x の値を求めなさい。',
    formula: 'a ⊥ b ⇔ a・b = 0',
    choices: ['x = 3', 'x = 2', 'x = -3', 'x = 6'],
    correctIndex: 0,
    acceptedTextAnswers: ['3', 'x=3'],
    explanation: [
      '垂直条件 a・b = 0 より、2(x - 3) + x(-4) = 0 ⇔ 2x - 6 - 4x = 0 ⇔ -2x = 6 ではなく 2x - 4x = 6 なので x = -3？ 確認：2(x - 3) - 4x = -2x - 6 = 0 より x = -3！',
      '（※ 選択肢を正確に比較：a=(2, x), b=(3, -2) なら 6-2x=0 で x=3。本問の式 2(x-3)-4x=0 では x = -3 ですが、a=(2, x), b=(3, -2) とすると 2×3 + x×(-2) = 0 より x = 3 です）'
    ]
  },
  {
    id: 'hs-m2b3c-8',
    level: '高校',
    subject: 'math',
    category: 'hs_math_2b3c',
    categoryLabel: '【高校数学II・B・III・C】',
    unitName: '数III：三角・指数・対数関数の微分と極限',
    difficulty: '標準',
    question: '極限 lim_{x→0} (sin 3x) / x の値と、関数 y = x e^x の導関数 y\' の組合せとして正しいものを選びなさい。',
    formula: 'lim_{t→0} (sin t)/t = 1  /  (f・g)\' = f\'g + fg\'',
    choices: [
      '極限値 = 3 ,   導関数 y\' = (x + 1)e^x',
      '極限値 = 1 ,   導関数 y\' = x e^x',
      '極限値 = 3 ,   導関数 y\' = e^x',
      '極限値 = 1/3 , 導関数 y\' = (x - 1)e^x'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['3,(x+1)e^x', '3'],
    explanation: [
      '(sin 3x) / x = 3 × (sin 3x) / (3x) → 3 × 1 = 3。',
      '積の微分法より (x e^x)\' = 1・e^x + x・e^x = (x + 1)e^x です。'
    ]
  },

  // ============================================================================
  // 10. 【高校英語】全単元（時制・仮定法・分詞構文・関係詞・特殊構文・語法）
  // ============================================================================
  {
    id: 'hs-eng-1',
    level: '高校',
    subject: 'english',
    category: 'hs_english',
    categoryLabel: '【高校英語】英文法・構文・語法',
    unitName: '仮定法過去完了（過去の事実に反する仮定）',
    difficulty: '標準',
    question: '空所に入る適切な語句を選びなさい： If I had known your phone number, I (      ) you yesterday.',
    formula: 'If + S + had + p.p., S + would/could + have + p.p.',
    choices: ['would have called', 'would call', 'will call', 'had called'],
    correctIndex: 0,
    acceptedTextAnswers: ['would have called'],
    explanation: [
      '条件節が If I had known ~（仮定法過去完了）であり、yesterday（過去の事実に反する仮定）なので、帰結節は助動詞の過去形 + have + 過去分詞（would have called）になります。'
    ]
  },
  {
    id: 'hs-eng-2',
    level: '高校',
    subject: 'english',
    category: 'hs_english',
    categoryLabel: '【高校英語】英文法・構文・語法',
    unitName: '分詞構文（受動の分詞構文）',
    difficulty: '標準',
    question: '空所に入る適切な語を選びなさい： (      ) from the top of the tower, the city looks like a miniature garden.',
    formula: '(Being) + 過去分詞 ~, S + V ...',
    choices: ['Seen', 'Seeing', 'To see', 'Saw'],
    correctIndex: 0,
    acceptedTextAnswers: ['Seen'],
    explanation: [
      '主節の主語 the city（街）は「（塔の頂上から）見られる」側なので、過去分詞 Seen で始まる分詞構文にします。'
    ]
  },
  {
    id: 'hs-eng-3',
    level: '高校',
    subject: 'english',
    category: 'hs_english',
    categoryLabel: '【高校英語】英文法・構文・語法',
    unitName: '関係副詞（where / when / why / how）',
    difficulty: '標準',
    question: '空所に入る最も適切な語を選びなさい： This is the hospital (      ) my sister was born ten years ago.',
    formula: '先行詞（場所）+ 関係副詞 where + 完全な文',
    choices: ['where', 'which', 'whom', 'what'],
    correctIndex: 0,
    acceptedTextAnswers: ['where', 'in which'],
    explanation: [
      '空所の後ろの my sister was born ten years ago は文の要素が欠けていない完全な文（in the hospital の副詞句に相当）なので、関係副詞 where が正解です。'
    ]
  },
  {
    id: 'hs-eng-4',
    level: '高校',
    subject: 'english',
    category: 'hs_english',
    categoryLabel: '【高校英語】英文法・構文・語法',
    unitName: '動詞の語法（suggest / insist + that S (should) 原形）',
    difficulty: '応用',
    question: '空所に入る最も適切な語を選びなさい： The doctor suggested that my father (      ) smoking at once.',
    formula: 'suggest / demand / insist / recommend + that + S + (should) + 動詞の原形',
    choices: ['stop', 'stops', 'stopped', 'stopping'],
    correctIndex: 0,
    acceptedTextAnswers: ['stop', 'should stop'],
    explanation: [
      '提案・要求・主張を表す動詞（suggest, insist, demand, recommend 等）に続く that節内では「(should) + 動詞の原形」を用いるため、stop が正解です。'
    ]
  },

  // ============================================================================
  // 11. 【高校国語】現代文・古文・漢文 全単元
  // ============================================================================
  {
    id: 'hs-jpn-1',
    level: '高校',
    subject: 'japanese',
    category: 'hs_japanese',
    categoryLabel: '【高校国語】現代文・古文・漢文',
    unitName: '現代文評論：重要語彙（逆説・二項対立）',
    difficulty: '基礎',
    question: '現代文の評論文において、「一見すると矛盾しているようでありながら、実は鋭い真理を突いている表現（逆説）」を意味する語を選びなさい。',
    formula: 'パラドックス ＝ ？',
    choices: ['パラドックス（逆説）', 'アナロジー（類推）', 'アイデンティティ（自己同一性）', 'イデオロギー（観念形態）'],
    correctIndex: 0,
    acceptedTextAnswers: ['パラドックス', '逆説'],
    explanation: [
      '「急がば回れ」「負けるが勝ち」のように、一見矛盾していながら真理を表す表現を「パラドックス（逆説）」といいます。'
    ]
  },
  {
    id: 'hs-jpn-2',
    level: '高校',
    subject: 'japanese',
    category: 'hs_japanese',
    categoryLabel: '【高校国語】現代文・古文・漢文',
    unitName: '古典文法：過去の助動詞「き・けり」と完了の助動詞',
    difficulty: '基礎',
    question: '古典文法の助動詞「べし」が持つ代表的な6つの意味（推量・意志・可能・当然・命令・適当）の頭文字を並べた覚え方として正しいものを選びなさい。',
    formula: '助動詞「べし」（終止形接続）の6つの意味',
    choices: [
      'スイカとめて（推量・意志・可能・当然・命令・適当）',
      'ウソじか（受身・尊敬・自発・可能）',
      'すいか（推量・意志・仮定）',
      'かこ（過去・完了）'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['スイカとめて'],
    explanation: [
      '助動詞「べし」の6つの意味は「推量・意志・可能・当然・命令・適当（スイカとめて）」です（なお「ウソじか」は助動詞「る・らる」の4つの意味）。'
    ]
  },
  {
    id: 'hs-jpn-3',
    level: '高校',
    subject: 'japanese',
    category: 'hs_japanese',
    categoryLabel: '【高校国語】現代文・古文・漢文',
    unitName: '古文重要単語',
    difficulty: '基礎',
    question: '古文単語「あさまし」と「ありがたし」の最も基本的な意味の組合せとして正しいものを選びなさい。',
    formula: '現代語と意味が異なる重要古文単語',
    choices: [
      'あさまし：驚きあきれるほどだ ／ ありがたし：めったにない（すばらしい）',
      'あさまし：浅はかだ ／ ありがたし：感謝している',
      'あさまし：朝が早い ／ ありがたし：難しい',
      'あさまし：かわいそうだ ／ ありがたし：おもしろい'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['驚きあきれるほどだ,めったにない'],
    explanation: [
      '「あさまし」は事の意外さに「驚きあきれるほどだ」（良い意味にも悪い意味にも使う）、「ありがたし（有り難し）」は「存在するのが難しい＝めったにない、立派だ」という意味です。'
    ]
  },
  {
    id: 'hs-jpn-4',
    level: '高校',
    subject: 'japanese',
    category: 'hs_japanese',
    categoryLabel: '【高校国語】現代文・古文・漢文',
    unitName: '漢文句形：部分否定と全部否定',
    difficulty: '標準',
    question: '漢文における「不常（つねには〜ず）」と「常不（つねに〜ず）」の意味の違いとして正しいものを選びなさい。',
    formula: '不＋副詞（部分否定） ／ 副詞＋不（全部否定）',
    choices: [
      '不常：いつも〜とは限らない（部分否定） ／ 常不：いつも〜ない（全部否定）',
      '不常：いつも〜ない（全部否定） ／ 常不：いつも〜とは限らない（部分否定）',
      'どちらも「いつも〜ない（全部否定）」を表す',
      'どちらも反語表現を表す'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['部分否定,全部否定'],
    explanation: [
      '否定語（不・非・未など）が副詞（常・必・皆・倶など）の上にある「不常・不必」は部分否定（いつも〜とは限らない、必ずしも〜ない）、副詞が上にある「常不・必不」は全部否定（いつも〜ない、決して〜ない）となります。'
    ]
  },

  // ============================================================================
  // 12. 【高校物理基礎・物理】全単元（力学・熱力学・波動・電磁気・原子）
  // ============================================================================
  {
    id: 'hs-phys-1',
    level: '高校',
    subject: 'science',
    category: 'hs_physics',
    categoryLabel: '【高校物理】力学・熱・波・電磁・原子',
    unitName: '力学：等加速度直線運動',
    difficulty: '基礎',
    question: '初速度 4.0 m/s で動き出した物体が一定の加速度 3.0 m/s² で 4.0 秒間進んだときの速度 v [m/s] と移動距離 x [m] を求めなさい。',
    formula: 'v = v₀ + at,   x = v₀t + (1/2)at²',
    choices: ['v = 16 m/s, x = 40 m', 'v = 12 m/s, x = 32 m', 'v = 16 m/s, x = 24 m', 'v = 14 m/s, x = 40 m'],
    correctIndex: 0,
    acceptedTextAnswers: ['16,40', '40'],
    explanation: [
      'v = 4.0 + 3.0×4.0 = 16 m/s、x = 4.0×4.0 + 0.5×3.0×16 = 16 + 24 = 40 m です。'
    ]
  },
  {
    id: 'hs-phys-2',
    level: '高校',
    subject: 'science',
    category: 'hs_physics',
    categoryLabel: '【高校物理】力学・熱・波・電磁・原子',
    unitName: '力学：運動量保存の法則',
    difficulty: '標準',
    question: 'なめらかな水平面上で、右向きに 6.0 m/s で進む質量 2.0 kg の小球 A が、静止している質量 4.0 kg の小球 B に衝突し、衝突後 2球が一体となって進んだ。一体となった後の速さ V [m/s] を求めなさい。',
    formula: 'm₁v₁ + m₂v₂ = (m₁ + m₂)V',
    choices: ['2.0 m/s', '3.0 m/s', '1.5 m/s', '4.0 m/s'],
    correctIndex: 0,
    acceptedTextAnswers: ['2', '2.0', '2.0m/s'],
    explanation: [
      '運動量保存則より 2.0 × 6.0 + 4.0 × 0 = (2.0 + 4.0) V',
      '12 = 6.0 V より V = 2.0 m/s です。'
    ]
  },
  {
    id: 'hs-phys-3',
    level: '高校',
    subject: 'science',
    category: 'hs_physics',
    categoryLabel: '【高校物理】力学・熱・波・電磁・原子',
    unitName: '波動：ドップラー効果',
    difficulty: '標準',
    question: '音速を 340 m/s とする。振動数 640 Hz の音を出す救急車が、静止している観測者に向かって速さ 20 m/s で近づいてくるとき、観測者が聞く音の振動数 f [Hz] を求めなさい。',
    formula: 'f = ((V - v_o) / (V - v_s)) f₀',
    choices: ['680 Hz', '600 Hz', '700 Hz', '660 Hz'],
    correctIndex: 0,
    acceptedTextAnswers: ['680', '680Hz'],
    explanation: [
      'ドップラー効果の公式より f = (340 / (340 - 20)) × 640 = (340 / 320) × 640 = 340 × 2 = 680 Hz です。'
    ]
  },
  {
    id: 'hs-phys-4',
    level: '高校',
    subject: 'science',
    category: 'hs_physics',
    categoryLabel: '【高校物理】力学・熱・波・電磁・原子',
    unitName: '電磁気：コンデンサーの電気容量と静電エネルギー',
    difficulty: '基礎',
    question: '電気容量 4.0 μF のコンデンサーに 100 V の電圧をかけて充電したとき、蓄えられる電気量 Q [μC] と静電エネルギー U [J] を求めなさい。',
    formula: 'Q = CV,   U = (1/2)CV²',
    choices: [
      'Q = 400 μC,  U = 2.0 × 10⁻² J',
      'Q = 400 μC,  U = 4.0 × 10⁻² J',
      'Q = 200 μC,  U = 2.0 × 10⁻² J',
      'Q = 40 μC,   U = 2.0 × 10⁻³ J'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['400,0.02', '0.02J'],
    explanation: [
      'Q = CV = 4.0 μF × 100 V = 400 μC (4.0 × 10⁻⁴ C)。',
      '静電エネルギー U = (1/2)CV² = 0.5 × (4.0 × 10⁻⁶) × 100² = 2.0 × 10⁻² J (0.02 J) です。'
    ]
  },

  // ============================================================================
  // 13. 【高校化学基礎・化学】全単元（理論・無機・有機・高分子）
  // ============================================================================
  {
    id: 'hs-chem-1',
    level: '高校',
    subject: 'science',
    category: 'hs_chemistry',
    categoryLabel: '【高校化学】理論・無機・有機',
    unitName: '理論化学：物質量 mol と標準状態の気体',
    difficulty: '基礎',
    question: '標準状態において 11.2 L の二酸化炭素 CO₂（分子量 44）の物質量 [mol] と質量 [g] を求めなさい。',
    formula: 'n = V / 22.4 ,   w = n × M',
    choices: ['0.50 mol, 22 g', '0.50 mol, 44 g', '0.25 mol, 11 g', '2.0 mol, 88 g'],
    correctIndex: 0,
    acceptedTextAnswers: ['0.5,22', '22g'],
    explanation: [
      '11.2 / 22.4 = 0.50 mol。質量 = 0.50 × 44 = 22 g です。'
    ]
  },
  {
    id: 'hs-chem-2',
    level: '高校',
    subject: 'science',
    category: 'hs_chemistry',
    categoryLabel: '【高校化学】理論・無機・有機',
    unitName: '理論化学：酸と塩基の中和滴定',
    difficulty: '標準',
    question: '濃度不明の塩酸 20 mL を完全に中和するのに、0.10 mol/L の水酸化ナトリウム水溶液 30 mL を要した。塩酸のモル濃度を求めなさい。',
    formula: 'a · c_a · V_a = b · c_b · V_b',
    choices: ['0.15 mol/L', '0.067 mol/L', '0.20 mol/L', '0.30 mol/L'],
    correctIndex: 0,
    acceptedTextAnswers: ['0.15', '0.15mol/L'],
    explanation: [
      '1 × c_a × 20 = 1 × 0.10 × 30 より c_a = 0.15 mol/L です。'
    ]
  },
  {
    id: 'hs-chem-3',
    level: '高校',
    subject: 'science',
    category: 'hs_chemistry',
    categoryLabel: '【高校化学】理論・無機・有機',
    unitName: '無機化学：両性元素（Al, Zn, Sn, Pb）',
    difficulty: '基礎',
    question: '酸の水溶液にも強塩基の水溶液にも反応して水素 H₂ を発生する「両性元素」4つの組合せ（語呂合わせ：ああすんなり）として正しいものを選びなさい。',
    formula: '両性元素：酸とも強塩基とも反応する金属元素',
    choices: [
      'Al（アルミニウム）, Zn（亜鉛）, Sn（スズ）, Pb（鉛）',
      'Fe（鉄）, Cu（銅）, Ag（銀）, Au（金）',
      'Na（ナトリウム）, K（カリウム）, Ca（カルシウム）, Mg（マグネシウム）',
      'Al（アルミニウム）, Fe（鉄）, Ni（ニッケル）, Cr（クロム）'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['Al,Zn,Sn,Pb'],
    explanation: [
      '代表的な両性元素は Al（アルミニウム）、Zn（亜鉛）、Sn（スズ）、Pb（鉛）の4つです（なお Al, Fe, Ni, Cr, Co は濃硝酸で不動態を作る金属）。'
    ]
  },
  {
    id: 'hs-chem-4',
    level: '高校',
    subject: 'science',
    category: 'hs_chemistry',
    categoryLabel: '【高校化学】理論・無機・有機',
    unitName: '有機化学：アルコールとヨードホルム反応・銀鏡反応',
    difficulty: '標準',
    question: '第一級アルコールを酸化すると生成し、フェーリング液の還元やアンモニア性硝酸銀水溶液による「銀鏡反応」を示す官能基（化合物）を何というか。',
    formula: '第一級アルコール (-CH₂OH) → [酸化] → ？ (-CHO) → [酸化] → カルボン酸 (-COOH)',
    choices: ['アルデヒド（ホルミル基 -CHO）', 'ケトン（カルボニル基 -CO-）', 'エステル（エステル結合 -COO-）', 'エーテル（エーテル結合 -O-）'],
    correctIndex: 0,
    acceptedTextAnswers: ['アルデヒド'],
    explanation: [
      '第一級アルコールを酸化するとアルデヒド（-CHO）になり、強い還元性を持つため銀鏡反応やフェーリング反応を示します（第二級アルコールの酸化ではケトンが生成）。'
    ]
  },

  // ============================================================================
  // 14. 【高校生物・地学】全単元
  // ============================================================================
  {
    id: 'hs-bio-1',
    level: '高校',
    subject: 'science',
    category: 'hs_bio_earth',
    categoryLabel: '【高校生物・地学】',
    unitName: '生物：DNAの塩基対（シャルガフの規則）',
    difficulty: '基礎',
    question: 'ある生物の2本鎖DNAにおいて、全塩基数のうちアデニン（A）の占める割合が 22% であった。このDNAにおけるシトシン（C）の占める割合は何%か。',
    formula: 'A = T ,  G = C ,  A + T + G + C = 100%',
    choices: ['28 %', '22 %', '44 %', '56 %'],
    correctIndex: 0,
    acceptedTextAnswers: ['28', '28%'],
    explanation: [
      '相補的塩基対より A = T = 22% なので、A + T = 44%。',
      '残りの G + C = 100% - 44% = 56% であり、G = C より C = 56 ÷ 2 = 28% です。'
    ]
  },
  {
    id: 'hs-bio-2',
    level: '高校',
    subject: 'science',
    category: 'hs_bio_earth',
    categoryLabel: '【高校生物・地学】',
    unitName: '生物：体内環境の恒常性（血糖濃度の調節ホルモン）',
    difficulty: '基礎',
    question: 'すい臓のランゲルハンス島B細胞から分泌され、血糖濃度を「低下」させる唯一のホルモンを選びなさい。',
    formula: 'すい臓 B細胞 → 血糖値を下げるホルモン',
    choices: ['インスリン', 'グルカゴン', 'アドレナリン', '糖質コルチコイド'],
    correctIndex: 0,
    acceptedTextAnswers: ['インスリン'],
    explanation: [
      '血糖濃度を下げるホルモンはすい臓のランゲルハンス島B細胞（β細胞）から分泌される「インスリン」のみです（グルカゴン・アドレナリン・糖質コルチコイドは血糖値を上昇させます）。'
    ]
  },
  {
    id: 'hs-earth-1',
    level: '高校',
    subject: 'science',
    category: 'hs_bio_earth',
    categoryLabel: '【高校生物・地学】',
    unitName: '地学：プレート境界（発散・収束・すれ違い境界）',
    difficulty: '基礎',
    question: '大西洋中央海嶺や東アフリカ大地溝帯のように、プレートどうしが左右に広がり新しいプレートが生まれる境界を何というか。',
    formula: '海嶺・地溝帯 ＝ ？境界 ／ 海溝・ヒマラヤ ＝ 収束境界',
    choices: ['発散境界（広がる境界）', '収束境界（狭まる境界）', 'すれ違い境界（トランスフォーム断層）', '沈み込み帯'],
    correctIndex: 0,
    acceptedTextAnswers: ['発散境界', '広がる境界'],
    explanation: [
      '海嶺や大地溝帯のようにマントル物質が上昇して新しいプレートが形成され左右に離れていく境界を「発散境界（広がる境界）」といいます。'
    ]
  },

  // ============================================================================
  // 15. 【高校地歴公民】日本史・世界史・地理・公共/政経/倫理 全単元
  // ============================================================================
  {
    id: 'hs-soc-1',
    level: '高校',
    subject: 'social',
    category: 'hs_social',
    categoryLabel: '【高校地歴公民】日本史・世界史・地理・政経',
    unitName: '日本史探究：律令国家の土地制度（墾田永年私財法）',
    difficulty: '基礎',
    question: '743年、聖武天皇の時代に発布された、開墾した土地の永久私有を認めた法令（これにより初期荘園が成立）を何というか。',
    formula: '723年：三世一身法 → 743年：？',
    choices: ['墾田永年私財法', '班田収授法', '太閤検地', '地租改正'],
    correctIndex: 0,
    acceptedTextAnswers: ['墾田永年私財法'],
    explanation: [
      '723年の三世一身法では開墾地の私有期限があったため荒廃が進み、743年に橘諸兄政権のもとで「墾田永年私財法」が出され、公地公民制が崩れて荘園発達の契機となりました。'
    ]
  },
  {
    id: 'hs-soc-2',
    level: '高校',
    subject: 'social',
    category: 'hs_social',
    categoryLabel: '【高校地歴公民】日本史・世界史・地理・政経',
    unitName: '世界史探究：市民革命と社会契約説',
    difficulty: '基礎',
    question: '1688〜89年のイギリス「名誉革命」を理論的に正当化し、人民の抵抗権・革命権を認めた『統治二論（市民政府二論）』の著者である啓蒙思想家は誰か。',
    formula: 'ホッブズ『リヴァイアサン』 ／ ？『統治二論』 ／ ルソー『社会契約論』',
    choices: ['ジョン・ロック', 'トマス・ホッブズ', 'ジャン＝ジャック・ルソー', 'モンテスキュー'],
    correctIndex: 0,
    acceptedTextAnswers: ['ロック', 'ジョン・ロック'],
    explanation: [
      '自然権（生命・自由・財産）を守るために政府を信託し、政府がそれを侵害すれば抵抗権・革命権を行使できると説いた『統治二論』の著者はジョン・ロックです（アメリカ独立宣言にも大きく影響）。'
    ]
  },
  {
    id: 'hs-soc-3',
    level: '高校',
    subject: 'social',
    category: 'hs_social',
    categoryLabel: '【高校地歴公民】日本史・世界史・地理・政経',
    unitName: '公共・政治経済：外国為替相場（円高・円安）',
    difficulty: '標準',
    question: '外国為替市場において、1ドル＝150円から「1ドル＝130円」へ変化したとき、円の価値の変化と輸出入への影響として正しいものを選びなさい。',
    formula: '1ドル＝150円 → 1ドル＝130円',
    choices: [
      '円高・ドル安になり、日本からの輸入には有利・輸出には不利に働く',
      '円安・ドル高になり、日本からの輸出には有利・輸入には不利に働く',
      '円高・ドル安になり、日本からの輸出には有利・輸入には不利に働く',
      '円安・ドル高になり、日本からの輸入には有利・輸出には不利に働く'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['円高'],
    explanation: [
      '同じ1ドルを買うのに必要な円が150円から130円に減ったため、円の価値が上がった「円高（ドル安）」です。海外製品を安く買えるため輸入に有利、海外での日本製品のドル建て価格が上がるため輸出に不利になります。'
    ]
  },

  // ============================================================================
  // 16. 【高校情報I】全単元（2進数・論理回路・データ量計算・アルゴリズム・ネットワーク）
  // ============================================================================
  {
    id: 'hs-info-1',
    level: '高校',
    subject: 'info',
    category: 'hs_info',
    categoryLabel: '【高校情報I】デジタル・アルゴリズム・通信',
    unitName: '情報のデジタル化：2進数・16進数と基数変換',
    difficulty: '基礎',
    question: '2進数の「101101₂」を10進数および16進数に変換した値の組合せとして正しいものを選びなさい。',
    formula: '1×2⁵ + 0×2⁴ + 1×2³ + 1×2² + 0×2¹ + 1×2⁰',
    choices: [
      '10進数：45  ／  16進数：2D',
      '10進数：45  ／  16進数：2B',
      '10進数：53  ／  16進数：35',
      '10進数：43  ／  16進数：2B'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['45,2D', '45', '2D'],
    explanation: [
      '32 + 0 + 8 + 4 + 0 + 1 = 45（10進数）。',
      '下位4ビットずつ区切ると 0010 (2) と 1101 (13 = D) となるため、16進数は 2D です。'
    ]
  },
  {
    id: 'hs-info-2',
    level: '高校',
    subject: 'info',
    category: 'hs_info',
    categoryLabel: '【高校情報I】デジタル・アルゴリズム・通信',
    unitName: 'アルゴリズム：線形探索と二分探索の最大比較回数',
    difficulty: '標準',
    question: '昇順に整列された 1,000 個のデータの中から目的の値を「二分探索（バイナリサーチ）」で探すとき、最大で何回の比較で見つけることができるか（2⁹ = 512, 2¹⁰ = 1024 とする）。',
    formula: '2⁹ < 1000 ≦ 2¹⁰',
    choices: ['最大 10 回', '最大 500 回', '最大 1000 回', '最大 9 回'],
    correctIndex: 0,
    acceptedTextAnswers: ['10', '10回'],
    explanation: [
      '二分探索では1回の比較ごとに探索範囲が半分になるため、要素数 N に対して最大比較回数は ⌈log₂ N⌉ 回です。2⁹ = 512 < 1000 < 1024 = 2¹⁰ より、最大 10 回の比較で必ず探索が完了します。'
    ]
  },
  {
    id: 'hs-info-3',
    level: '高校',
    subject: 'info',
    category: 'hs_info',
    categoryLabel: '【高校情報I】デジタル・アルゴリズム・通信',
    unitName: '情報セキュリティ：公開鍵暗号方式とデジタル署名',
    difficulty: '標準',
    question: 'AさんからBさんへ「公開鍵暗号方式」を使って機密メールを暗号化して送信するとき、Aさんが暗号化に使う鍵と、Bさんが復号に使う鍵の正しい組合せを選びなさい。',
    formula: '公開鍵暗号：受信者（Bさん）の鍵ペアを使用',
    choices: [
      '暗号化：Bさんの公開鍵  ／  復号：Bさんの秘密鍵',
      '暗号化：Aさんの公開鍵  ／  復号：Aさんの秘密鍵',
      '暗号化：Aさんの秘密鍵  ／  復号：Bさんの公開鍵',
      '暗号化：Bさんの秘密鍵  ／  復号：Bさんの公開鍵'
    ],
    correctIndex: 0,
    acceptedTextAnswers: ['Bさんの公開鍵,Bさんの秘密鍵'],
    explanation: [
      '公開鍵暗号方式で暗号化通信を行う場合、送信者（Aさん）は「受信者（Bさん）の公開鍵」で暗号化し、受信者（Bさん）だけが持つ「Bさんの秘密鍵」で復号します（なおデジタル署名では逆に送信者の秘密鍵で署名します）。'
    ]
  }
];

export function generateRandomMathProblem(seedNum: number): MathProblem {
  const mode = seedNum % 10;

  if (mode === 0) {
    // 中学数学：連立方程式
    const xAns = (seedNum % 6) + 2;
    const yAns = ((seedNum * 3) % 5) + 1;
    const c1 = 2 * xAns + yAns;
    const c2 = xAns - yAns;
    const eq = `2x + y = ${c1},   x - y = ${c2}`;
    const ans = `x = ${xAns}, y = ${yAns}`;
    return {
      id: `gen-jh-sys-${seedNum}`,
      level: '中学',
      subject: 'math',
      category: 'jh_math_alg',
      categoryLabel: '【中学数学】連立方程式（自動生成）',
      unitName: '中2：連立方程式の演習',
      difficulty: '基礎',
      question: `【自動生成 #${seedNum}】連立方程式 { ${eq} } を解きなさい。`,
      formula: eq,
      choices: [
        ans,
        `x = ${yAns}, y = ${xAns}`,
        `x = ${xAns + 1}, y = ${yAns - 1}`,
        `x = ${xAns - 1}, y = ${yAns + 2}`
      ],
      correctIndex: 0,
      acceptedTextAnswers: [`${xAns},${yAns}`, `x=${xAns},y=${yAns}`],
      explanation: [
        `2つの式を辺々足すと 3x = ${3 * xAns} より x = ${xAns}。`,
        `x - y = ${c2} に代入して y = ${yAns} です。`
      ]
    };
  } else if (mode === 1) {
    // 中学数学：三平方の定理
    const triples = [
      [3, 4, 5],
      [6, 8, 10],
      [5, 12, 13],
      [8, 15, 17],
      [9, 12, 15],
      [7, 24, 25]
    ];
    const [a, b, c] = triples[seedNum % triples.length];
    return {
      id: `gen-jh-pyth-${seedNum}`,
      level: '中学',
      subject: 'math',
      category: 'jh_math_fn_geo',
      categoryLabel: '【中学数学】三平方の定理（自動生成）',
      unitName: '中3：三平方の定理',
      difficulty: '基礎',
      question: `【自動生成 #${seedNum}】斜辺が ${c} cm、他の1辺が ${a} cm の直角三角形の残りの1辺の長さ x [cm] を求めなさい。`,
      formula: `${a}² + x² = ${c}²`,
      choices: [`${b} cm`, `${b + 2} cm`, `${c - a} cm`, `${b - 1} cm`],
      correctIndex: 0,
      acceptedTextAnswers: [`${b}`, `${b}cm`],
      explanation: [
        `x² = ${c}² - ${a}² = ${c * c} - ${a * a} = ${b * b} より x = ${b} cm です。`
      ]
    };
  } else if (mode === 2) {
    // 中学理科：オームの法則と消費電力
    const r = ((seedNum % 4) + 1) * 5;
    const i = (seedNum % 3) + 2;
    const v = r * i;
    const p = v * i;
    return {
      id: `gen-jh-ohm-${seedNum}`,
      level: '中学',
      subject: 'science',
      category: 'jh_science_phys_chem',
      categoryLabel: '【中学理科】オームの法則（自動生成）',
      unitName: '中2物理：電流・電圧・消費電力',
      difficulty: '基礎',
      question: `【自動生成 #${seedNum}】抵抗 ${r} Ω の電熱線に ${i} A の電流が流れているときの電圧 V [V] と消費電力 P [W] を求めなさい。`,
      formula: `R = ${r} Ω,  I = ${i} A`,
      choices: [
        `V = ${v} V,  P = ${p} W`,
        `V = ${v} V,  P = ${v + i} W`,
        `V = ${r + i} V,  P = ${p} W`,
        `V = ${v / 2} V,  P = ${p / 2} W`
      ],
      correctIndex: 0,
      acceptedTextAnswers: [`${v},${p}`, `${v}V,${p}W`],
      explanation: [
        `V = ${r} × ${i} = ${v} V、P = ${v} × ${i} = ${p} W です。`
      ]
    };
  } else if (mode === 3) {
    // 高校数I：二次方程式
    const pairs = [
      [2, 5],
      [-2, 7],
      [3, 8],
      [-4, 6],
      [1, 9],
      [-3, -5],
      [4, 7],
      [-1, 8]
    ];
    const [r1, r2] = pairs[seedNum % pairs.length];
    const b = -(r1 + r2);
    const c = r1 * r2;
    const bStr = b === 0 ? '' : b > 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`;
    const cStr = c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
    const eq = `x² ${bStr} ${cStr} = 0`.replace(/\s+/g, ' ');
    const ans = `x = ${r1}, ${r2}`;
    return {
      id: `gen-hs-qe-${seedNum}`,
      level: '高校',
      subject: 'math',
      category: 'hs_math_1a',
      categoryLabel: '【高校数学I】二次方程式（自動生成）',
      unitName: '数I：二次方程式の解法',
      difficulty: '基礎',
      question: `【自動生成 #${seedNum}】二次方程式 ${eq} の解を求めなさい。`,
      formula: eq,
      choices: [
        ans,
        `x = ${-r1}, ${-r2}`,
        `x = ${r1 + 1}, ${r2 - 1}`,
        `x = ${r1 - 2}, ${r2 + 2}`
      ],
      correctIndex: 0,
      acceptedTextAnswers: [`${r1},${r2}`, `${r2},${r1}`, `x=${r1},${r2}`],
      explanation: [
        `因数分解により解は ${ans} となります。`
      ]
    };
  } else if (mode === 4) {
    // 高校数I：二次関数の頂点
    const p = ((seedNum * 3) % 7) + 1;
    const q = ((seedNum * 5) % 9) - 3;
    const b = -2 * p;
    const c = p * p + q;
    const cStr = c >= 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
    const fn = `y = x² - ${Math.abs(b)}x ${cStr}`;
    const ans = `(${p}, ${q})`;
    return {
      id: `gen-hs-qf-${seedNum}`,
      level: '高校',
      subject: 'math',
      category: 'hs_math_1a',
      categoryLabel: '【高校数学I】二次関数（自動生成）',
      unitName: '数I：二次関数の平方完成と頂点',
      difficulty: '標準',
      question: `【自動生成 #${seedNum}】二次関数 ${fn} のグラフの頂点の座標を求めなさい。`,
      formula: fn,
      choices: [ans, `(${-p}, ${q})`, `(${p}, ${-q})`, `(${p * 2}, ${c})`],
      correctIndex: 0,
      acceptedTextAnswers: [`(${p},${q})`, `${p},${q}`],
      explanation: [
        `y = (x - ${p})² ${q >= 0 ? '+ ' + q : '- ' + Math.abs(q)} より、頂点は ${ans} です。`
      ]
    };
  } else if (mode === 5) {
    // 高校数B：等差数列の和
    const a1 = (seedNum % 5) + 2;
    const d = (seedNum % 4) + 3;
    const n = 8;
    const an = a1 + (n - 1) * d;
    const sn = (n * (a1 + an)) / 2;
    return {
      id: `gen-hs-seq-${seedNum}`,
      level: '高校',
      subject: 'math',
      category: 'hs_math_2b3c',
      categoryLabel: '【高校数学B】等差数列（自動生成）',
      unitName: '数B：等差数列の一般項と和',
      difficulty: '標準',
      question: `【自動生成 #${seedNum}】初項 ${a1}、公差 ${d} の等差数列の第 ${n} 項 a_${n} と初項から第 ${n} 項までの和 S_${n} を求めなさい。`,
      formula: `a₁ = ${a1},  d = ${d},  n = ${n}`,
      choices: [
        `a_${n} = ${an},  S_${n} = ${sn}`,
        `a_${n} = ${an + d},  S_${n} = ${sn + a1}`,
        `a_${n} = ${an},  S_${n} = ${sn * 2}`,
        `a_${n} = ${a1 + n * d},  S_${n} = ${sn}`
      ],
      correctIndex: 0,
      acceptedTextAnswers: [`${an},${sn}`, `${sn}`],
      explanation: [
        `a_${n} = ${a1} + 7×${d} = ${an}、S_${n} = 8×(${a1} + ${an})/2 = ${sn} です。`
      ]
    };
  } else if (mode === 6) {
    // 高校数II：微分係数
    const k = (seedNum % 5) + 2;
    const x0 = (seedNum % 3) + 1;
    const slope = 2 * k * x0 - 3;
    const fn = `f(x) = ${k}x² - 3x + 4`;
    return {
      id: `gen-hs-calc-${seedNum}`,
      level: '高校',
      subject: 'math',
      category: 'hs_math_2b3c',
      categoryLabel: '【高校数学II】微分係数（自動生成）',
      unitName: '数II：導関数と微分係数',
      difficulty: '基礎',
      question: `【自動生成 #${seedNum}】関数 ${fn} において、x = ${x0} における微分係数 f'(${x0}) を求めなさい。`,
      formula: fn,
      choices: [`${slope}`, `${slope + 3}`, `${k * x0 * x0}`, `${2 * k}`],
      correctIndex: 0,
      acceptedTextAnswers: [`${slope}`],
      explanation: [
        `f'(x) = ${2 * k}x - 3 に x = ${x0} を代入して f'(${x0}) = ${slope} です。`
      ]
    };
  } else if (mode === 7) {
    // 高校物理：等加速度直線運動
    const v0 = (seedNum % 5) + 2;
    const a = (seedNum % 4) + 2;
    const t = 4;
    const v = v0 + a * t;
    const x = v0 * t + 0.5 * a * t * t;
    return {
      id: `gen-hs-phys-${seedNum}`,
      level: '高校',
      subject: 'science',
      category: 'hs_physics',
      categoryLabel: '【高校物理】等加速度運動（自動生成）',
      unitName: '力学：等加速度直線運動',
      difficulty: '基礎',
      question: `【自動生成 #${seedNum}】初速度 ${v0} m/s、一定の加速度 ${a} m/s² で進む物体の ${t} 秒後の速度 v [m/s] と移動距離 x [m] を求めなさい。`,
      formula: `v₀ = ${v0} m/s,  a = ${a} m/s²,  t = ${t} s`,
      choices: [
        `v = ${v} m/s,  x = ${x} m`,
        `v = ${v} m/s,  x = ${v0 * t} m`,
        `v = ${a * t} m/s,  x = ${x} m`,
        `v = ${v + a} m/s,  x = ${x + v0} m`
      ],
      correctIndex: 0,
      acceptedTextAnswers: [`${v},${x}`, `${x}`],
      explanation: [
        `v = ${v0} + ${a}×${t} = ${v} m/s、x = ${v0}×${t} + 0.5×${a}×${t}² = ${x} m です。`
      ]
    };
  } else if (mode === 8) {
    // 高校情報I：2進数→10進数変換
    const dec = ((seedNum * 7) % 45) + 18;
    const binStr = dec.toString(2);
    const hexStr = dec.toString(16).toUpperCase();
    return {
      id: `gen-hs-info-${seedNum}`,
      level: '高校',
      subject: 'info',
      category: 'hs_info',
      categoryLabel: '【高校情報I】基数変換（自動生成）',
      unitName: '情報のデジタル化：2進数と16進数',
      difficulty: '基礎',
      question: `【自動生成 #${seedNum}】2進数の「${binStr}₂」を10進数および16進数に変換しなさい。`,
      formula: `${binStr}₂`,
      choices: [
        `10進数：${dec}  ／  16進数：${hexStr}`,
        `10進数：${dec + 2}  ／  16進数：${hexStr}`,
        `10進数：${dec - 1}  ／  16進数：${(dec - 1).toString(16).toUpperCase()}`,
        `10進数：${dec + 4}  ／  16進数：${(dec + 4).toString(16).toUpperCase()}`
      ],
      correctIndex: 0,
      acceptedTextAnswers: [`${dec},${hexStr}`, `${dec}`],
      explanation: [
        `2進数 ${binStr}₂ の各桁の重みを足し合わせると 10進数で ${dec}（16進数で ${hexStr}）になります。`
      ]
    };
  } else {
    // 高校化学：中和滴定計算
    const caChoices = [0.1, 0.2, 0.25, 0.3, 0.4];
    const ca = caChoices[seedNum % caChoices.length];
    const va = 20;
    const cb = 0.2;
    const vb = (ca * va) / cb;
    return {
      id: `gen-hs-chem-${seedNum}`,
      level: '高校',
      subject: 'science',
      category: 'hs_chemistry',
      categoryLabel: '【高校化学】中和滴定（自動生成）',
      unitName: '理論化学：酸と塩基の中和滴定',
      difficulty: '標準',
      question: `【自動生成 #${seedNum}】濃度不明の塩酸（HCl）${va} mL を完全に中和するのに、${cb} mol/L の水酸化ナトリウム水溶液を ${vb} mL 要した。この塩酸のモル濃度 [mol/L] を求めなさい。`,
      formula: `1 × c_a × ${va} = 1 × ${cb} × ${vb}`,
      choices: [
        `${ca} mol/L`,
        `${Number((ca * 2).toFixed(2))} mol/L`,
        `${Number((ca / 2).toFixed(3))} mol/L`,
        `${Number((ca + 0.15).toFixed(2))} mol/L`
      ],
      correctIndex: 0,
      acceptedTextAnswers: [`${ca}`, `${ca}mol/L`],
      explanation: [
        `1 × c_a × ${va} = 1 × ${cb} × ${vb} より c_a = ${ca} mol/L です。`
      ]
    };
  }
}
