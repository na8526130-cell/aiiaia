import { SubjectGroup } from './mathScienceProblems';

export interface RedSheetNote {
  id: string;
  level: '中学' | '高校';
  subject: Exclude<SubjectGroup, 'all'>;
  unitTitle: string;
  items: {
    id: string;
    prefix: string;
    hiddenTerm: string;
    suffix: string;
  }[];
}

export interface FlashcardItem {
  id: string;
  level: '中学' | '高校';
  subject: Exclude<SubjectGroup, 'all'>;
  categoryName: string;
  front: string;
  back: string;
  detail: string;
}

export const RED_SHEET_NOTES: RedSheetNote[] = [
  {
    id: 'rs-eng-1',
    level: '高校',
    subject: 'english',
    unitTitle: '【英語】最頻出 仮定法・関係詞・重要構文の赤シート暗記',
    items: [
      {
        id: 'rs-e1',
        prefix: '「もしあの時〜だったら、…だっただろう」は仮定法過去完了を用い、If + S + ',
        hiddenTerm: 'had + 過去分詞',
        suffix: ', S + would (could/might) + have + 過去分詞 で表す。'
      },
      {
        id: 'rs-e2',
        prefix: '「もし〜がなければ（現在の仮定）」は Without (But for) 〜 または ',
        hiddenTerm: 'If it were not for',
        suffix: ' 〜（倒置形：Were it not for 〜）で表す。'
      },
      {
        id: 'rs-e3',
        prefix: '提案・要求・命令の動詞（suggest, insist, demand 等）に続く that節内は ',
        hiddenTerm: '(should) + 動詞の原形',
        suffix: ' を用いる。'
      },
      {
        id: 'rs-e4',
        prefix: '時や条件を表す副詞節（when, if, as soon as 等）の中では、未来のことでも ',
        hiddenTerm: '現在形',
        suffix: ' で表す。'
      },
      {
        id: 'rs-e5',
        prefix: '先行詞が場所であっても、後ろに不完全な文（主語や目的語が欠けた文）が続く場合は関係代名詞 ',
        hiddenTerm: 'which (または that)',
        suffix: ' を用い、完全な文が続く場合は関係副詞 where を用いる。'
      }
    ]
  },
  {
    id: 'rs-jpn-1',
    level: '高校',
    subject: 'japanese',
    unitTitle: '【国語】古文重要単語・助動詞・漢文句形の赤シート暗記',
    items: [
      {
        id: 'rs-j1',
        prefix: '古文単語「あさまし」の意味は「',
        hiddenTerm: '驚きあきれるほどだ・意外だ',
        suffix: '」、「あやし」は「不思議だ・身分が低い」。'
      },
      {
        id: 'rs-j2',
        prefix: '古文単語「おぼつかなし」の意味は「',
        hiddenTerm: 'はっきりしない・気がかりだ・待ち遠しい',
        suffix: '」、「ゆかし」は「見たい・聞きたい・知りたい」。'
      },
      {
        id: 'rs-j3',
        prefix: '過去の助動詞「き」は「',
        hiddenTerm: '直接体験した過去',
        suffix: '」を表し、「けり」は「伝聞過去・詠嘆」を表す。'
      },
      {
        id: 'rs-j4',
        prefix: '係り結びの法則：「ぞ・なむ・や・か」の結びは ',
        hiddenTerm: '連体形',
        suffix: ' 、「こそ」の結びは 已然形 になる。'
      },
      {
        id: 'rs-j5',
        prefix: '漢文の部分否定「不常〜」は「',
        hiddenTerm: 'つねには〜ず（いつも〜とは限らない）',
        suffix: '」と読み、全部否定「常不〜（つねに〜ず）」と区別する。'
      }
    ]
  },
  {
    id: 'rs-soc-1',
    level: '高校',
    subject: 'social',
    unitTitle: '【社会・歴史・政経】日本史・世界史の画期＆憲法・経済の赤シート暗記',
    items: [
      {
        id: 'rs-s1',
        prefix: '743年に発布された、開墾した土地の永久私有を認めた法令は ',
        hiddenTerm: '墾田永年私財法',
        suffix: ' であり、荘園発生の契機となった。'
      },
      {
        id: 'rs-s2',
        prefix: '1889年に発布された大日本帝国憲法はプロイセン憲法を範とし、1946年公布・1947年5月3日施行の ',
        hiddenTerm: '日本国憲法',
        suffix: ' は国民主権・基本的人権の尊重・平和主義を三大原則とする。'
      },
      {
        id: 'rs-s3',
        prefix: '1648年、三十年戦争の講和条約として結ばれた ',
        hiddenTerm: 'ウェストファリア条約',
        suffix: ' は最初の近代的国際条約とされ、主権国家体制が確立した。'
      },
      {
        id: 'rs-s4',
        prefix: '日本銀行が不況時に行う金融緩和政策は、市中銀行から国債などを買い入れて通貨供給量を増やす ',
        hiddenTerm: '買いオペレーション（公開市場操作）',
        suffix: ' である。'
      },
      {
        id: 'rs-s5',
        prefix: 'ケッペンの気候区分で、夏に亜熱帯高圧帯の影響で乾燥しオリーブなどの樹木農業が行われるのは ',
        hiddenTerm: '地中海性気候（Cs）',
        suffix: ' である。'
      }
    ]
  },
  {
    id: 'rs-sci-1',
    level: '高校',
    subject: 'science',
    unitTitle: '【理科】化学反応・物質量・生物DNA・物理公式の赤シート暗記',
    items: [
      {
        id: 'rs-c1',
        prefix: '標準状態（0℃, 1.013×10⁵ Pa）におけるすべての気体 1 mol の体積は ',
        hiddenTerm: '22.4 L',
        suffix: ' であり、含まれる粒子数はアボガドロ定数 6.02×10²³ 個である。'
      },
      {
        id: 'rs-c2',
        prefix: 'アンモニアの工業的製法は ',
        hiddenTerm: 'ハーバー・ボッシュ法',
        suffix: ' 、硝酸の工業的製法は オストワルト法 、炭酸ナトリウムの工業的製法は アンモニアソーダ法（ソルベー法）である。'
      },
      {
        id: 'rs-c3',
        prefix: 'DNAの二重らせん構造では、アデニン(A)と ',
        hiddenTerm: 'チミン(T)',
        suffix: ' 、グアニン(G)と シトシン(C) が相補的に結合する（シャルガフの規則）。RNAではチミンの代わりに ウラシル(U) が使われる。'
      },
      {
        id: 'rs-c4',
        prefix: '中学理科：銅と酸素が結びついて酸化銅ができるときの質量比（銅：酸素：酸化銅）は ',
        hiddenTerm: '4 : 1 : 5',
        suffix: ' 、マグネシウム：酸素：酸化マグネシウムは 3 : 2 : 5 である。'
      },
      {
        id: 'rs-c5',
        prefix: '理想気体の状態方程式は ',
        hiddenTerm: 'PV = nRT',
        suffix: ' で表され、定圧変化ではシャルルの法則（V/T = 一定）、定温変化ではボイルの法則（PV = 一定）が成り立つ。'
      }
    ]
  },
  {
    id: 'rs-inf-1',
    level: '高校',
    subject: 'info',
    unitTitle: '【情報I】デジタル表現・アルゴリズム・情報セキュリティの赤シート暗記',
    items: [
      {
        id: 'rs-i1',
        prefix: 'アナログ音声をデジタル化するPCM方式は「',
        hiddenTerm: '標本化（サンプリング）→ 量子化 → 符号化',
        suffix: '」の3段階で行われる。'
      },
      {
        id: 'rs-i2',
        prefix: '昇順に整列済みのデータ N 件から目的の値を探す二分探索（バイナリサーチ）の最大比較回数は ',
        hiddenTerm: 'log₂ N（O(log N)）',
        suffix: ' であり、1024件なら最大10回で探索できる。'
      },
      {
        id: 'rs-i3',
        prefix: 'デジタル署名では、送信者が自分の「',
        hiddenTerm: '秘密鍵',
        suffix: '」で署名を作成し、受信者が送信者の「公開鍵」で復号・検証することでなりすましと改ざんを検知する。'
      }
    ]
  }
];

export const FLASHCARD_ITEMS: FlashcardItem[] = [
  {
    id: 'fc-1',
    level: '中学',
    subject: 'math',
    categoryName: '中学数学・二次方程式',
    front: '二次方程式 ax² + bx + c = 0 (a ≠ 0) の「解の公式」を答えよ。',
    back: 'x = (-b ± √(b² - 4ac)) / (2a)',
    detail: '根号の中の D = b² - 4ac を判別式といい、D > 0 で異なる2つの実数解、D = 0 で重解となります。'
  },
  {
    id: 'fc-2',
    level: '中学',
    subject: 'english',
    categoryName: '中学英語・現在完了',
    front: '「私は3年間ずっと京都に住んでいます」を現在完了形（継続）で英作文せよ。',
    back: 'I have lived in Kyoto for three years.',
    detail: 'have/has + 過去分詞。「〜の間」は for + 期間、「〜以来」は since + 起点 を用います。'
  },
  {
    id: 'fc-3',
    level: '中学',
    subject: 'science',
    categoryName: '中学理科・化学反応',
    front: '炭酸水素ナトリウム（NaHCO₃）を加熱したときの熱分解の化学反応式を答えよ。',
    back: '2NaHCO₃ → Na₂CO₃ + H₂O + CO₂',
    detail: '炭酸ナトリウム（強アルカリ性）、水、二酸化炭素に分解します。'
  },
  {
    id: 'fc-4',
    level: '中学',
    subject: 'social',
    categoryName: '中学社会・公民',
    front: '日本国憲法第25条に規定されている「健康で文化的な最低限度の生活を営む権利」を何というか。',
    back: '生存権（社会権の一つ）',
    detail: '社会権には生存権のほか、教育を受ける権利（26条）、勤労の権利（27条）、労働基本権（28条）があります。'
  },
  {
    id: 'fc-5',
    level: '高校',
    subject: 'math',
    categoryName: '高校数学II・微積分',
    front: '放物線と直線で囲まれた面積を求める「1/6公式」：∫_α^β (x - α)(x - β) dx の値は？',
    back: '-(β - α)³ / 6',
    detail: '面積 S は |a|(β - α)³ / 6 で瞬時に算出できます。'
  },
  {
    id: 'fc-6',
    level: '高校',
    subject: 'english',
    categoryName: '高校英語・重要構文',
    front: '「〜して初めて…だとわかる」を It is not until A that B を使って表すと？',
    back: 'It is not until A that B（＝ Not until A + 疑問文語順）',
    detail: '例：It is not until you lose your health that you realize its value.'
  },
  {
    id: 'fc-7',
    level: '高校',
    subject: 'japanese',
    categoryName: '高校古文・重要単語',
    front: '古文単語「ねんごろなり」「おぼゆ」「めざまし」の意味をそれぞれ答えよ。',
    back: 'ねんごろなり＝熱心だ・親密だ ／ おぼゆ＝思われる・似ている ／ めざまし＝すばらしい・心外だ',
    detail: '現代語と意味が異なる多義語は入試・定期考査の最頻出項目です。'
  },
  {
    id: 'fc-8',
    level: '高校',
    subject: 'science',
    categoryName: '高校物理・力学',
    front: '初速度 v₀、加速度 a の等加速度直線運動の3公式を答えよ。',
    back: '① v = v₀ + at  ② x = v₀t + (1/2)at²  ③ v² - v₀² = 2ax',
    detail: '時間 t を含まない問題では③の式（v² - v₀² = 2ax）を使うと1ステップで解けます。'
  },
  {
    id: 'fc-9',
    level: '高校',
    subject: 'science',
    categoryName: '高校化学・無機有機',
    front: '銀イオン（Ag⁺）に過剰のアンモニア水を加えたときに生じる錯イオンの名称と化学式は？',
    back: 'ジアンミン銀(I)イオン  [Ag(NH₃)₂]⁺',
    detail: '少量のNH₃水で褐色沈殿 Ag₂O を生じ、過剰のNH₃水で無色の [Ag(NH₃)₂]⁺ となって再溶解します。'
  },
  {
    id: 'fc-10',
    level: '高校',
    subject: 'social',
    categoryName: '高校歴史・日本史世界史',
    front: '1929年の世界恐慌に対し、アメリカの大統領フランクリン＝ローズヴェルトが実施した政策は？',
    back: 'ニューディール政策（TVA：テネシー川流域開発公社など）',
    detail: '金本位制の停止や公共事業・農業調整法(AAA)・全国産業復興法(NIRA)による修正資本主義政策です。'
  },
  {
    id: 'fc-11',
    level: '高校',
    subject: 'info',
    categoryName: '高校情報I・ネットワーク',
    front: 'ドメイン名（example.jp 等）と IPアドレスを相互に変換する仕組みを何というか。',
    back: 'DNS（Domain Name System）',
    detail: 'TCP/IPの4階層は「アプリケーション層・トランスポート層・インターネット層・ネットワークインターフェース層」です。'
  }
];
