"use strict";
// GI Hub scope log: the procedure vocabulary, the dictation reader, and the
// numbers the Endo tab and the report show. Pure: no DOM and no storage.
// A logbook of what the fellow's hands did, not a case record: a colonoscopy's
// reach is how far the fellow got before staff took over.
// Loaded after study.js; uses fmtDate (coach.js) and DAYS/MONTHS when called.

// ---- Vocabulary ------------------------------------------------------------------------
const SCOPE_SITES = [["hsc", "HSC", "HSC"], ["stb", "St. Boniface", "St. B"], ["grace", "Grace", "Grace"]];
const SCOPE_LOCS = [["suite", "Endoscopy suite", "Suite"], ["ed", "Emergency department", "ED"], ["icu", "ICU", "ICU"]];
// Landmarks in the order a scope passes them; rank is the index.
const SCOPE_REACH = [["sig", "Sigmoid", "Sig"], ["desc", "Descending", "Desc"], ["sf", "Splenic flexure", "SF"],
  ["tverse", "Transverse", "T-verse"], ["hf", "Hepatic flexure", "HF"], ["cecum", "Cecum", "Cecum"], ["ti", "Terminal ileum", "TI"]];
const SCOPE_TRES_REACH = {sig: "Sig", desc: "Desc", sf: "SF", tverse: "Tverse", hf: "HF", cecum: "Cecum", ti: "TI"};
const scopeRank = r => SCOPE_REACH.findIndex(x => x[0] === r);
const scopeReachLabel = r => (SCOPE_REACH.find(x => x[0] === r) || [, ""])[1];
const scopeReachShort = r => (SCOPE_REACH.find(x => x[0] === r) || [, , ""])[2];
// How a reach reads in a sentence: "Colonoscopy to cecum", "to HF".
const SCOPE_REACH_SAY = {sig: "sigmoid", desc: "descending", sf: "SF", tverse: "transverse", hf: "HF", cecum: "cecum", ti: "TI"};

const SCOPE_FAMS = [["egd", "Gastroscopy", "EGD"], ["colo", "Colonoscopy", "Colonoscopy"], ["fs", "Flex sig", "Flex sig"],
  ["ercp", "ERCP", "ERCP"], ["para", "Paracentesis", "Paracentesis"], ["other", "Other", "Other"]];
const scopeFamLabel = f => (SCOPE_FAMS.find(x => x[0] === f) || [, "Other"])[1];
const scopeFamShort = f => (SCOPE_FAMS.find(x => x[0] === f) || [, , "Other"])[2];

// code, family, label, T-Res label, C8 case-mix stem (or null). "base" codes
// are the procedure itself; the rest are what was done during it.
const SCOPE_PROCS = [
  ["egd.dx", "egd", "Diagnostic", "EGD: Diagnostic", null, "base"],
  ["egd.bx", "egd", "Biopsy", "EGD: Biopsy"],
  ["egd.brush", "egd", "Brushing", "EGD: Brushing"],
  ["egd.be", "egd", "Barrett's screening", "EGD: Screen BE"],
  ["egd.entero", "egd", "Push enteroscopy", "EGD: Enteroscopy"],
  ["egd.poly", "egd", "Polypectomy", "EGD: Polypectomy", "polypectomy"],
  ["egd.fb", "egd", "Foreign body removal", "EGD: FB Removal", "foreign body"],
  ["egd.peg", "egd", "PEG", "EGD: PEG Placement"],
  ["egd.nj", "egd", "NJ tube", "EGD: NJ placement"],
  ["egd.stent", "egd", "Stent", "EGD: Endoluminal SP"],
  ["egd.dil.balloon", "egd", "Balloon dilation", "EGD: Dilate: Balloon", "dilations"],
  ["egd.dil.bougie", "egd", "Bougie dilation", "EGD: Dilate: Bougie", "dilations"],
  ["egd.dil.pneum", "egd", "Pneumatic dilation", "EGD: Dilate: Pneumatic", "dilations"],
  ["egd.nv", "egd", "Hemostasis", "EGD: Hemostasis", "non-variceal hemostasis"],
  ["egd.nv.clip", "egd", "Clip", "EGD: NVUGIB: Clip", "non-variceal hemostasis"],
  ["egd.nv.inj", "egd", "Injection", "EGD: NVUGIB: Injection", "non-variceal hemostasis"],
  ["egd.nv.apc", "egd", "APC", "EGD: NVUGIB: APC", "non-variceal hemostasis"],
  ["egd.nv.bipolar", "egd", "Bipolar", "EGD: NVUGIB: Bipolar", "non-variceal hemostasis"],
  ["egd.ev.band", "egd", "Banding", "EGD: EVB: Band", "variceal hemostasis"],
  ["egd.ev.glue", "egd", "Glue", "EGD: EVB: Glue", "variceal hemostasis"],
  ["egd.ev.sclero", "egd", "Sclerotherapy", "EGD: EVB: Sclerotherapy", "variceal hemostasis"],
  ["colo.dx", "colo", "Diagnostic", "ColoDiag", null, "base"],
  ["colo.screen", "colo", "Screening", "ColoScreen", null, "base"],
  ["colo.bx", "colo", "Biopsy", "Colo: Biopsy"],
  ["colo.poly", "colo", "Polypectomy", "Colo: Polypectomy", "polypectomy"],
  ["colo.bigpoly", "colo", "Large polypectomy", "Colo: Large Polypectomy", "polypectomy >1 cm"],
  ["colo.dil", "colo", "Dilation", "Colo: Colonic Dilation", "dilations"],
  ["colo.stent", "colo", "Stent", "Colo: Endoluminal Stent"],
  ["colo.hem", "colo", "Hemostasis", "Colo: Hemostasis", "non-variceal hemostasis"],
  ["colo.hem.clip", "colo", "Clip", "Colo: Hemostasis: Clip", "non-variceal hemostasis"],
  ["colo.hem.inj", "colo", "Injection", "Colo: Hemostasis: Injection", "non-variceal hemostasis"],
  ["colo.hem.apc", "colo", "APC", "Colo: Hemostasis: APC", "non-variceal hemostasis"],
  ["colo.hem.bipolar", "colo", "Bipolar", "Colo: Hemostasis: Bipolar", "non-variceal hemostasis"],
  ["fs.dx", "fs", "Diagnostic", "FS: Diag/Screen", null, "base"],
  ["fs.bx", "fs", "Biopsy", "FS: Biopsy"],
  ["fs.poly", "fs", "Polypectomy", "FS: Polypectomy", "polypectomy"],
  ["fs.dil", "fs", "Dilation", "FS: Colonic Dilation", "dilations"],
  ["fs.stent", "fs", "Stent", "FS: Endoluminal SP"],
  ["fs.hem", "fs", "Hemostasis", "FS: Hemostasis", "non-variceal hemostasis"],
  ["ercp.dx", "ercp", "Diagnostic", "ERCP: Diagnostic", null, "base"],
  ["ercp.sphinc", "ercp", "Sphincterotomy", "ERCP: Sphincterotomy"],
  ["ercp.bx", "ercp", "Biopsy", "ERCP: Biopsy"],
  ["ercp.brush", "ercp", "Brushings", "ERCP: Brushings"],
  ["ercp.plastic", "ercp", "Plastic biliary stent", "ERCP: Plastic Biliary SP"],
  ["ercp.metal", "ercp", "Metal biliary stent", "ERCP: Metal Biliary SP"],
  ["ercp.panc", "ercp", "Pancreatic stent", "ERCP: Pancreatic SP"],
  ["para.dx", "para", "Diagnostic", "Tap: Diagnostic", null, "base"],
  ["para.ther", "para", "Therapeutic", "Tap: Therapeutic", null, "base"],
  ["other.ileo", "other", "Ileoscopy", "Other: Ileoscopy", null, "base"],
  ["other.x", "other", "Other procedure", "Other", null, "base"],
].map(([code, fam, label, tres, c8, kind]) => ({code, fam, label, tres, c8: c8 || null, base: kind === "base"}));
const SCOPE_PROC = {};
for (const p of SCOPE_PROCS) SCOPE_PROC[p.code] = p;
const scopeFam = code => SCOPE_PROC[code] ? SCOPE_PROC[code].fam : code.split(".")[0];

// Why the case was done. [code, label, spoken forms (regex source)]
const SCOPE_WHY = [
  ["hematemesis", "Hematemesis", "hematemesis|haematemesis|vomiting blood|coffee[- ]grounds?|coffee ground emesis"],
  ["melena", "Melena", "melena|melaena|black stools?|tarry stools?|dark stools?"],
  ["hematochezia", "Hematochezia", "hematochezia|haematochezia|bright red blood|brbpr|rectal bleed(?:ing)?|blood per rectum"],
  ["ugib", "Upper GI bleed", "upper gi bleed(?:ing)?|ugib|upper bleed"],
  ["lgib", "Lower GI bleed", "lower gi bleed(?:ing)?|lgib|lower bleed"],
  ["ogib", "Obscure or small bowel bleed", "obscure (?:gi )?bleed(?:ing)?|small bowel bleed(?:ing)?|obscure"],
  ["ida", "Iron deficiency anemia", "iron deficiency(?: anemia| anaemia)?|ida|low iron|anemia|anaemia"],
  ["dysphagia", "Dysphagia", "dysphagia|trouble swallowing|difficulty swallowing|food sticking"],
  ["odynophagia", "Odynophagia", "odynophagia|painful swallowing"],
  ["reflux", "Reflux", "reflux|gerd|heartburn"],
  ["dyspepsia", "Dyspepsia or abdominal pain", "dyspepsia|epigastric pain|abdominal pain|abdo pain"],
  ["nausea", "Nausea or vomiting", "nausea|vomiting"],
  ["fb", "Food bolus or foreign body", "food bolus|foreign body|impaction|impacted|coin|battery"],
  ["imaging", "Abnormal imaging", "abnormal imaging|abnormal ct|abnormal cat scan|thickening on ct|seen on ct"],
  ["crc", "CRC screening", "crc screening|colon cancer screening|positive fit|fit positive|fit test|average risk|screening"],
  ["surv", "Polyp surveillance", "polyp surveillance|history of polyps|surveillance"],
  ["barrettsurv", "Barrett's surveillance", "barrett'?s surveillance"],
  ["varscreen", "Variceal screening", "variceal screening|screening for varices|varices screening"],
  ["ibd", "IBD assessment", "ibd|flare|disease activity"],
  ["diarrhea", "Diarrhea", "diarrh(?:o)?ea|loose stools?"],
  ["feeding", "Feeding access", "feeding|nutrition"],
  ["biliary", "Biliary obstruction or cholangitis", "cholangitis|obstructive jaundice|jaundice|biliary obstruction"],
  ["pancreatitis", "Pancreatitis", "pancreatitis"],
  ["ascites", "Ascites", "ascites|sbp|rule out sbp"],
  ["other", "Other", ""],
].map(([code, label, words]) => ({code, label, words}));
// What was found.
const SCOPE_FOUND = [
  ["normal", "Normal", "normal|no abnormalities|unremarkable|nothing found|all normal"],
  ["esophagitis", "Esophagitis", "esophagitis|oesophagitis|la grade [a-d]|erosive"],
  ["eoe", "EoE", "eoe|eosinophilic(?: esophagitis)?|rings and furrows|furrows"],
  ["barretts", "Barrett's", "barrett'?s|barrett"],
  ["ev", "Esophageal varices", "esophageal varices|varices|varix"],
  ["gv", "Gastric varices", "gastric varices|gastric varix|igv|gov"],
  ["phg", "Portal hypertensive gastropathy", "portal hypertensive gastropathy|portal gastropathy|phg"],
  ["hh", "Hiatus hernia", "hiatus hernia|hiatal hernia"],
  ["mwt", "Mallory-Weiss tear", "mallory[- ]weiss(?: tear)?|mwt"],
  ["gastritis", "Gastritis", "gastritis"],
  ["gu", "Gastric ulcer", "gastric ulcers?|stomach ulcers?|antral ulcers?|prepyloric ulcers?"],
  ["du", "Duodenal ulcer", "duodenal ulcers?|bulb(?:ar)? ulcers?|ulcers? in the (?:duodenum|bulb)"],
  ["rectal", "Rectal ulcer", "(?:solitary )?rectal ulcer(?:s|ation)?|ulcers? in the rectum"],
  ["pud", "Peptic ulcer", "peptic ulcers?|pud|ulcers?"],
  ["angio", "Angiodysplasia", "angiodysplasias?|angioectasias?|avms?|ectasias?"],
  ["gave", "GAVE", "gave|watermelon stomach"],
  ["dieulafoy", "Dieulafoy", "dieulafoy"],
  ["mass", "Mass or cancer", "mass|cancer|tumou?r|malignancy|carcinoma|adenocarcinoma|neoplasm"],
  ["polyp", "Polyp", "polyps?|adenomas?"],
  ["divertic", "Diverticulosis", "diverticulosis|diverticula|diverticulum|tics"],
  ["hemorrhoids", "Hemorrhoids", "ha?emorrhoids|piles"],
  ["uc", "Ulcerative colitis", "ulcerative colitis|uc"],
  ["crohns", "Crohn's", "crohn'?s(?: disease| colitis)?|crohn"],
  ["ischemic", "Ischemic colitis", "ischa?emic colitis|ischa?emia"],
  ["colitis", "Colitis", "colitis"],
  ["stricture", "Stricture", "strictures?|stenosis|narrowing|schatzki(?: ring)?"],
  ["celiac", "Celiac appearance", "celiac|coeliac|scalloping"],
  ["candida", "Candida", "candida|candidiasis|thrush"],
  ["stones", "Stones", "cbd stones?|bile duct stones?|choledocholithiasis|stones?|sludge"],
  ["leak", "Bile leak", "bile leak|leak"],
  ["ppb", "Post-polypectomy bleed", "post[- ]?polypectomy bleed(?:ing)?|ppb"],
  ["active", "Active bleeding", "actively bleeding|active(?:ly)? bleed(?:ing)?|spurting|oozing"],
  ["other", "Other", ""],
].map(([code, label, words]) => ({code, label, words}));
const scopeWhyLabel = c => (SCOPE_WHY.find(x => x.code === c) || {label: c}).label;
const scopeFoundLabel = c => (SCOPE_FOUND.find(x => x.code === c) || {label: c}).label;

// Manitoba statutory holidays through Year 1 (a call shift on one is a weekend shift).
const SCOPE_STAT_DAYS = ["2026-07-01", "2026-08-03", "2026-09-07", "2026-09-30", "2026-10-12", "2026-11-11",
  "2026-12-25", "2026-12-26", "2027-01-01", "2027-02-15", "2027-03-26", "2027-05-24", "2027-07-01"];

// ---- Number guard ------------------------------------------------------------------------
const SCOPE_MONTHS_GUARD = "jan\\w*|feb\\w*|mar\\w*|apr\\w*|may|jun\\w*|jul\\w*|aug\\w*|sep\\w*|oct\\w*|nov\\w*|dec\\w*";
// Nothing that could identify a patient is ever parsed or stored: long digit
// runs (PHIN, MRN, chart numbers) and whatever follows an identifier word.
function scopeGuard(text) {
  let removed = 0, t = String(text || "");
  const dateish = "(?:\\d[\\d/.-]*|" + SCOPE_MONTHS_GUARD + ")(?:st|nd|rd|th)?";
  t = t.replace(new RegExp("\\b(?:mrn|phin|dob|d\\.o\\.b\\.?|date of birth|health (?:card )?number|chart number|hospital number|born on)\\b" +
    "\\s*(?:is|was|:|#|number|no\\.?|of)?\\s*(?:" + dateish + "[\\s,]*){0,4}", "gi"), () => { removed++; return " "; });
  t = t.replace(/\d[\d\s-]*\d/g, m => (m.replace(/\D/g, "").length >= 6 ? (removed++, " ") : m));
  return {text: t.replace(/[ \t]{2,}/g, " ").trim(), removed};
}

// ---- Reading dictation ---------------------------------------------------------------------
const SCOPE_NUMS = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10};
const SCOPE_STOP = new Set(("a an the and or but with for of to in on at by from into onto up as far so then than " +
  "i we me my our it its it's was were is are be been being had has have did do does done doing got get gets getting " +
  "made make makes also some any one ones this that these those there here which who whom what when where why how " +
  "just very really quite pretty bit little lot lots about after before during while until till again once twice " +
  "dr doctor staff attending attendings patient patients pt pts case cases today yesterday morning afternoon evening " +
  "night tonight scope scoped scoping performed procedure procedures went go goes going well fine ok okay good nice great " +
  "quick easy found find showed shows show saw seen see noted note had took take takes taking over off out all way " +
  "myself him her them they he she his hers their theirs you your yours us not no yes yeah um uh er like " +
  "small large few multiple several left right both each more most less least another other others same thing " +
  "because due likely possible possibly probably maybe first second third last next new old lady man woman guy gentleman " +
  "year years old ago week weeks day days time times minute minutes hour hours around through past beyond near " +
  "colon cecum ileum sigmoid transverse descending ascending hepatic splenic flexure rectum stomach duodenum esophagus " +
  "bulb antrum body fundus distal proximal mid upper lower gi mm cm size sized centimetre centimeter millimetre millimeter " +
  "removed removal remove retrieved pushed cleared placed place placement put inserted done did intubated reached").split(/\s+/));

const re = (src, flags) => new RegExp(src, flags || "g");
const WORD_B = "(?<![a-z0-9'])", WORD_E = "(?![a-z0-9'])";
const phrase = src => re(WORD_B + "(?:" + src + ")" + WORD_E);

const SCOPE_FAM_RX = [
  ["egd", phrase("egds?|egd's|gastroscop\\w*|upper endoscop\\w*|an upper|the upper|upper scope|ogd|esophagogastroduodenoscop\\w*")],
  ["egd:entero", phrase("push enteroscop\\w*|enteroscop\\w*")],
  ["colo", phrase("colonoscop\\w*|colons?|colo|lower endoscop\\w*|a lower")],
  ["fs", phrase("flex(?:ible)? sig\\w*|flexi[- ]?sig\\w*|flexsig\\w*|sigmoidoscop\\w*|flex|flexes")],
  ["ercp", phrase("ercps?")],
  ["para", phrase("paracentes[ie]s|paras?|taps?|ascitic taps?")],
  ["other:ileo", phrase("ileoscop\\w*|pouchoscop\\w*|stoma scope")],
  ["both", phrase("bidirectional|bi-directional|both ends")],
];
const SCOPE_FAM_PLURAL = phrase("(two|three|four|five|six|seven|eight|nine|ten|[2-9]|10)\\s+(?:more\\s+)?(egds|egd's|gastroscopies|colonoscopies|colons|flex sigs|flexes|sigmoidoscopies|ercps|paracenteses|paras|taps|scopes|uppers)");
const SCOPE_SEP = phrase("and then|then|next|after that|followed by|another one|another|next case|second case|third case|fourth case|fifth case|also did");
const SCOPE_AGAIN = phrase("another one|another like that|same again|same thing|one more like that");

const SCOPE_LM = [
  ["ti", "neo-?terminal ileum|terminal ileum|neo-?ti|ti|ileum|ileal"],
  ["cecum", "base of the c(?:a)?ecum|c(?:a)?ecum|c(?:a)?ecal|appendiceal orifice|ileoc(?:a)?ecal valve|icv"],
  ["hf", "hepatic flexure|hepatic|hf|ascending(?: colon)?"],
  ["tverse", "transverse(?: colon)?|t-?verse"],
  ["sf", "splenic flexure|splenic|sf"],
  ["desc", "descending(?: colon)?|desc"],
  ["sig", "recto-?sigmoid|sigmoid(?: colon)?|sig"],
];
const SCOPE_LM_RX = re(WORD_B + "(" + SCOPE_LM.map(x => x[1]).join("|") + ")" + WORD_E);
const scopeLmCode = w => { for (const [c, src] of SCOPE_LM) if (new RegExp("^(?:" + src + ")$").test(w)) return c; return null; };
const SCOPE_CUE_BEFORE = /(?:^|[^a-z])(?:to|reached|reach|reaching|got to|get to|getting to|made it to|up to|as far as|into|until|till|past|beyond|intubated|intubate|entered|around to)\s+(?:the\s+)?(?:(?:proximal|distal|mid|level of the|end of the)\s+)?$/;
const SCOPE_TAKEOVER = phrase("staff|attending|took over|take over|taking over|takes over|took it|handed(?: it)? over|handed off|hand(?:ed)? it off|took the scope|finished it|finished|completed it");
const SCOPE_COMPLETE = [["cecum", phrase("all the way|to completion|complete colonoscopy|full colonoscopy|c(?:a)?ecal intubation|intubated the c(?:a)?ecum")],
  ["ti", phrase("intubated the (?:ti|terminal ileum|ileum)|ileal intubation|ti intubation|(?:ti|ileum) intubated")]];

// Therapies: [pattern, handler(fam, ctx) -> codes]
const SCOPE_TX = [
  [phrase("glue|cyanoacrylate|histoacryl"), () => ["egd.ev.glue"]],
  [phrase("sclero\\w*"), () => ["egd.ev.sclero"]],
  [phrase("band(?:s|ed|ing)?|ligat(?:ed|ion)|evl|banding ligation"), () => ["egd.ev.band"]],
  [phrase("peg(?: tube)?|pegs|g[- ]tube|gastrostomy"), () => ["egd.peg"]],
  [phrase("nj(?: tube)?|nasojejunal(?: tube)?"), () => ["egd.nj"]],
  [phrase("food bolus|foreign body|fb removal|disimpact\\w*|impaction|impacted|coin|battery"), () => ["egd.fb"]],
  [phrase("sphincterotom\\w*|papillotom\\w*"), () => ["ercp.sphinc"]],
  [phrase("(?:fully covered |uncovered |covered |metal |plastic |pancreatic |pd |biliary |cbd )*(?:stent(?:s|ed|ing)?|sems|fcsems|wallstent)"),
    (fam, m) => fam === "ercp" ? [/pancreatic|\bpd\b/.test(m) ? "ercp.panc" : /metal|sems|covered|wallstent/.test(m) ? "ercp.metal" : "ercp.plastic"]
      : [fam === "colo" ? "colo.stent" : fam === "fs" ? "fs.stent" : "egd.stent"]],
  [phrase("(?:balloon |cre |tts |bougie |savary |maloney |pneumatic |rigiflex |achalasia )*(?:dilat(?:ed|ion|ions|e|ing)|dilatation|stretched)|savary|bougie|maloney|pneumatic dilation|rigiflex"),
    (fam, m) => fam === "colo" ? ["colo.dil"] : fam === "fs" ? ["fs.dil"] :
      [/pneumatic|rigiflex|achalasia/.test(m) ? "egd.dil.pneum" : /bougie|savary|maloney/.test(m) ? "egd.dil.bougie" : "egd.dil.balloon"]],
  [phrase("(?:cold |hot )?snare(?:d)?(?: polypectom\\w*)?|polypectom\\w*|emr|(?:removed|resected|took off) (?:a |the |an |one |two |three |four |five |\\d+ )?" +
    "(?:\\d+(?:\\.\\d+)? ?(?:cm|mm|centimet\\w*|millimet\\w*) |small |large |big |sessile |pedunculated |flat |tiny )*polyps?|polyps? (?:was |were )?(?:removed|resected)"),
    (fam, m, ctx) => {
      const big = ctx.bigPolyp || /emr/.test(m);
      if (fam === "egd") return ["egd.poly"];
      if (fam === "fs") return ["fs.poly"];
      return big ? ["colo.poly", "colo.bigpoly"] : ["colo.poly"];
    }],
  [phrase("biops(?:y|ies|ied|ying)|bx|bxs|cold forceps"), fam => [fam + ".bx"].filter(c => SCOPE_PROC[c])],
  [phrase("brush(?:ings?|ed)?|cytology brush\\w*"), fam => [fam === "ercp" ? "ercp.brush" : "egd.brush"]],
  [phrase("barrett'?s screen\\w*|screen(?:ing|ed)? for barrett'?s|screen be"), () => ["egd.be"]],
  [phrase("apc|argon(?: plasma)?(?: coagulation)?"), (fam, m, ctx) => [hemCode(fam, "apc", ctx)]],
  [phrase("bipolar|bicap|gold probe|heater probe|coag(?:ulation)? probe|coagrasper"), (fam, m, ctx) => [hemCode(fam, "bipolar", ctx)]],
  [phrase("clip(?:s|ped|ping)?|hemoclips?|endoclips?"), (fam, m, ctx) => fam === "colo" && !ctx.bleed ? [] : [hemCode(fam, "clip", ctx)]],
  [phrase("epi|epinephrine|adrenaline|inject(?:ed|ion|ions)?"), (fam, m, ctx) => [hemCode(fam, "inj", ctx)]],
  [phrase("ha?emostasis|cauteri[sz]\\w*|coagulat\\w*|cautery"), (fam, m, ctx) => [hemCode(fam, "", ctx)]],
];
function hemCode(fam, kind, ctx) {
  if (fam === "fs") return "fs.hem";
  if (fam === "colo") return "colo.hem" + (kind ? "." + kind : "");
  return "egd.nv" + (kind ? "." + kind : "");
}
// When a therapy is said before any procedure word, the family it implies.
const SCOPE_TX_DEFAULT = {"egd.ev": "egd", "egd.peg": "egd", "egd.nj": "egd", "egd.fb": "egd", "ercp": "ercp", "egd.be": "egd"};

const SCOPE_SITE_RX = [["hsc", phrase("hsc|health sciences?(?: cent(?:re|er))?")],
  ["stb", phrase("st\\.? ?b|saint b|st\\.? boniface|saint boniface|boniface|sbh")],
  ["grace", phrase("grace(?: hospital)?|the grace")]];
const SCOPE_LOC_RX = [["suite", phrase("endo(?:scopy)? (?:suite|unit)|the suite|gi unit")],
  ["ed", phrase("ed|er|emerg|emergency department|emergency room|the emergency")],
  ["icu", phrase("icu|intensive care(?: unit)?|critical care|the unit|micu|sicu|ccu")]];
const SCOPE_URG_RX = [["urgent", phrase("urgent\\w*|emergent\\w*|emergency scope|stat|on call|overnight|after hours|middle of the night|call scope|at night")],
  ["elective", phrase("elective|outpatient|routine|scheduled|booked")]];
const SCOPE_MONTHS = ["jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "june?", "july?", "aug(?:ust)?",
  "sep(?:t(?:ember)?)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?"];
const SCOPE_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function scopeNormalize(text) {
  return String(text || "")
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, ", ")
    // Abbreviation dots are not sentence ends.
    .replace(/\b(dr|st|mr|mrs|ms|vs|approx|pt)\./gi, "$1")
    // Spelled-out initials from dictation: "E G D" -> "EGD", "T. I." -> "TI".
    .replace(/\b[A-Z](?:[ .]+[A-Z]\b)+\.?/g, m => m.replace(/[ .]/g, ""))
    .replace(/\s+/g, " ").trim();
}

// Sentences, then segments inside them split at "then", "next", "another".
function scopeSegments(text) {
  const out = [];
  for (const sent of text.split(/(?<!\d)[.:](?!\d)|[;!?\n]+/)) {
    const s = sent.trim();
    if (!s) continue;
    const lower = s.toLowerCase(), cuts = [];
    let m;
    SCOPE_SEP.lastIndex = 0;
    while ((m = SCOPE_SEP.exec(lower))) cuts.push({at: m.index, len: m[0].length, word: m[0]});
    let pos = 0, first = true, sep = null;
    const push = (a, b) => {
      const t = s.slice(a, b).replace(/^[\s,]+|[\s,]+$/g, "");
      if (t && !/^(?:(?:and|um|uh|so|ok|okay|also|a|the)\s*)+$/i.test(t)) { out.push({text: t, newSentence: first, sep}); first = false; }
    };
    for (const c of cuts) {
      push(pos, c.at);
      sep = c.word;
      // "another one" keeps its words so the copy can be recognised.
      pos = /another/.test(c.word) ? c.at : c.at + c.len;
    }
    push(pos, s.length);
  }
  return out;
}
function scopeFamsIn(lower) {
  const fams = [];
  for (const [f, rx] of SCOPE_FAM_RX) { rx.lastIndex = 0; if (rx.test(lower)) fams.push(f); }
  return fams;
}

// Staff: an exact name or alias scores 3; the same consonant skeleton 2; a
// skeleton one letter off 1.5; a close spelling 1.
const scopeLetters = s => String(s || "").toLowerCase().replace(/^dr\.?\s+/, "").replace(/[^a-z]/g, "");
function scopeKey(s) {
  const w = scopeLetters(s).replace(/cz/g, "ch").replace(/sz/g, "sh").replace(/ph/g, "f").replace(/ck/g, "k").replace(/ch/g, "k")
    .replace(/[cq]/g, "k").replace(/w/g, "v").replace(/z/g, "s").replace(/x/g, "ks");
  if (!w) return "";
  return (w[0] + w.slice(1).replace(/[aeiouyh]/g, "")).replace(/(.)\1+/g, "$1");
}
function scopeLev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 9;
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function scopeStaffNames(p) {
  const parts = String(p.name || "").split(",").map(x => x.trim()).filter(Boolean);
  const out = [];
  if (parts[0]) out.push(parts[0]);
  if (parts[1]) { out.push(parts[1].split(/\s+/)[0]); out.push(parts[1] + " " + parts[0]); }
  for (const a of p.aliases || []) out.push(a);
  return out.map(scopeLetters).filter(Boolean);
}
function scopeStaffScore(token, p) {
  const t = scopeLetters(token), tk = scopeKey(token);
  if (t.length < 2) return 0;
  let best = 0;
  for (const n of scopeStaffNames(p)) {
    if (t === n) return 3;
    const nk = scopeKey(n);
    if (tk.length >= 3 && tk === nk) best = Math.max(best, 2);
    else if (tk.length >= 4 && nk.length >= 4 && scopeLev(tk, nk) <= 1) best = Math.max(best, 1.5);
    else if (n.length >= 5 && scopeLev(t, n) <= (n.length >= 7 ? 2 : 1)) best = Math.max(best, 1);
  }
  return best;
}
function scopeStaffMatch(token, staff) {
  let top = 0, ids = [];
  for (const p of staff || []) {
    if (p.hidden) continue;
    const s = scopeStaffScore(token, p);
    if (s > top) { top = s; ids = [p.id]; } else if (s && s === top) ids.push(p.id);
  }
  if (!top) return null;
  return ids.length === 1 ? {id: ids[0], score: top} : {alts: ids, score: top};
}

// Words the vocabulary uses; a staff surname that is also one of these needs
// "with" or "Dr." in front of it to count as a name ("stone").
let scopeVocabMemo = null;
function scopeVocabWords() {
  if (scopeVocabMemo) return scopeVocabMemo;
  const set = new Set();
  for (const x of SCOPE_WHY.concat(SCOPE_FOUND)) for (const w of x.words.split(/[^a-z]+/)) if (w.length > 2) set.add(w);
  scopeVocabMemo = set;
  return set;
}
const SCOPE_STAFF_CUE = /(?:^|[^a-z])(?:with|dr\.?|doctor|staff|attending|supervised by|under)\s+(?:dr\.?\s+|doctor\s+)?$/;

function scopeDateFrom(lower, today) {
  const day = (y, m, d) => new Date(y, m, d, 12);
  const t = day(today.getFullYear(), today.getMonth(), today.getDate());
  let m;
  if ((m = phrase("today|this morning|this afternoon|tonight|this evening").exec(lower))) return {d: t, m};
  if ((m = phrase("yesterday|last night").exec(lower))) return {d: day(t.getFullYear(), t.getMonth(), t.getDate() - 1), m};
  if ((m = re(WORD_B + "(last\\s+)?(" + SCOPE_WEEKDAYS.join("|") + ")" + WORD_E).exec(lower))) {
    const want = SCOPE_WEEKDAYS.indexOf(m[2]);
    let back = (t.getDay() - want + 7) % 7;
    if (m[1] && back === 0) back = 7;
    return {d: day(t.getFullYear(), t.getMonth(), t.getDate() - back), m};
  }
  const mon = "(" + SCOPE_MONTHS.join("|") + ")\\.?";
  if ((m = re(WORD_B + mon + "\\s+(\\d{1,2})(?:st|nd|rd|th)?" + WORD_E).exec(lower)) ||
      (m = re(WORD_B + "(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+" + mon + WORD_E).exec(lower))) {
    const monWord = isNaN(+m[1]) ? m[1] : m[2], dd = isNaN(+m[1]) ? +m[2] : +m[1];
    const mi = SCOPE_MONTHS.findIndex(src => new RegExp("^(?:" + src + ")$").test(monWord));
    if (mi >= 0 && dd >= 1 && dd <= 31) {
      let d = day(t.getFullYear(), mi, dd);
      if (d > t) d = day(t.getFullYear() - 1, mi, dd);
      return {d, m};
    }
  }
  if ((m = re(WORD_B + "the\\s+(\\d{1,2})(?:st|nd|rd|th)" + WORD_E).exec(lower))) {
    const dd = +m[1];
    let d = day(t.getFullYear(), t.getMonth(), dd);
    if (d > t) d = day(t.getFullYear(), t.getMonth() - 1, dd);
    return {d, m};
  }
  return null;
}

// Reads one case's words. text: the case's segments joined with commas.
function scopeReadCase(text, ctx) {
  const lower = text.toLowerCase(), used = new Uint8Array(lower.length);
  const mark = (a, b) => { for (let i = Math.max(0, a); i < Math.min(lower.length, b); i++) used[i] = 1; };
  const all = rx => { const out = []; rx.lastIndex = 0; let m; while ((m = rx.exec(lower))) { out.push(m); if (!m[0].length) rx.lastIndex++; } return out; };
  const draft = {d: null, staff: null, staffHeard: null, staffSaid: null, staffAlt: [], site: null, loc: null, urg: null,
    procs: [], reach: null, why: [], found: [], leftover: [], n: 1};
  const add = (list, c) => { if (c && !list.includes(c)) list.push(c); };

  // Learned phrases first, so a personal word wins over the built-in reading.
  for (const l of ctx.learned || []) {
    const h = String(l.heard || "").toLowerCase().trim();
    if (!h) continue;
    for (const m of all(phrase(h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))) {
      mark(m.index, m.index + m[0].length);
      if (l.kind === "why") add(draft.why, l.code);
      else if (l.kind === "found") add(draft.found, l.code);
      else if (l.kind === "proc") add(draft.procs, l.code);
    }
  }
  const dt = scopeDateFrom(lower, ctx.today || new Date());
  if (dt) { draft.d = fmtDate(dt.d); mark(dt.m.index, dt.m.index + dt.m[0].length); }
  for (const [code, rx] of SCOPE_SITE_RX) for (const m of all(rx)) { draft.site = draft.site || code; mark(m.index, m.index + m[0].length); }
  for (const [code, rx] of SCOPE_LOC_RX) for (const m of all(rx)) { draft.loc = draft.loc || code; mark(m.index, m.index + m[0].length); }
  let urgent = false, elective = false;
  for (const m of all(SCOPE_URG_RX[0][1])) { urgent = true; mark(m.index, m.index + m[0].length); }
  for (const m of all(SCOPE_URG_RX[1][1])) { elective = true; mark(m.index, m.index + m[0].length); }
  draft.urg = elective ? "elective" : urgent ? "urgent" : null;

  // Procedure words, in order, so each therapy belongs to the procedure named before it.
  const famAt = [];
  for (const [f, rx] of SCOPE_FAM_RX) for (const m of all(rx)) {
    const pre = lower.slice(Math.max(0, m.index - 9), m.index);
    famAt.push({f, at: m.index, loc: /(?:in|of|into|through) the $/.test(pre)});
    mark(m.index, m.index + m[0].length);
  }
  famAt.sort((a, b) => a.at - b.at);
  const fams = [];
  for (const x of famAt) {
    if (x.f === "both") { add(fams, "egd"); add(fams, "colo"); continue; }
    add(fams, x.f.split(":")[0]);
  }
  const pl = SCOPE_FAM_PLURAL.exec(lower);
  SCOPE_FAM_PLURAL.lastIndex = 0;
  if (pl) { draft.n = SCOPE_NUMS[pl[1]] || +pl[1] || 1; mark(pl.index, pl.index + pl[0].length); }

  const bleed = /bleed|melena|melaena|hematochezia|haematochezia|hematemesis|brbpr|blood|ha?emostasis|oozing|spurting/.test(lower);
  const sizeCm = /(\d+(?:\.\d+)?)\s*(?:cm|centimet\w*)/.exec(lower), sizeMm = /(\d+)\s*(?:mm|millimet\w*)/.exec(lower);
  const bigPolyp = /\b(?:large|big|giant|lifted|lift)\b/.test(lower) || /(?:over|more than|bigger than|greater than) (?:a|one) centimet/.test(lower) ||
    (sizeCm && +sizeCm[1] >= 1) || (sizeMm && +sizeMm[1] >= 10);
  const tctx = {bleed, bigPolyp};
  const famFor = at => {
    let f = null;
    for (const x of famAt) if (x.at <= at && x.f !== "both") f = x.f.split(":")[0];
    if (!f && famAt.length) f = famAt[0].f === "both" ? "egd" : famAt[0].f.split(":")[0];
    return f;
  };
  const txCodes = [];
  for (const [rx, fn] of SCOPE_TX) for (const m of all(rx)) {
    if (used[m.index]) continue;
    let fam = famFor(m.index);
    const codes0 = fn(fam || "egd", m[0], tctx);
    if (!fam && codes0.length) {
      const d = Object.keys(SCOPE_TX_DEFAULT).find(k => codes0[0].startsWith(k));
      fam = d ? SCOPE_TX_DEFAULT[d] : /poly/.test(codes0[0]) ? "colo" : (/hematochezia|lower|rectal/.test(lower) ? "colo" : "egd");
      add(fams, fam);
    }
    const codes = fam ? fn(fam, m[0], tctx) : codes0;
    if (!codes.length) continue;
    for (const c of codes) add(txCodes, c);
    mark(m.index, m.index + m[0].length);
  }
  // Explicit "diagnostic" or "therapeutic" words for paracentesis; the rest is read from the words.
  const therapeuticTap = /therapeutic|large volume|litres?|liters?|drained|\bl off\b/.test(lower);

  // Colonoscopy base and reach.
  const coloWords = famAt.filter(x => x.f === "colo");
  const txColo = txCodes.some(c => c.startsWith("colo."));
  const onlyLocColo = coloWords.length && coloWords.every(x => x.loc) && txColo;
  if (fams.includes("colo") && !onlyLocColo && (coloWords.length || famAt.some(x => x.f === "both"))) {
    add(draft.procs, /screen|fit|average risk/.test(lower.replace(/barrett'?s screen\w*|screen\w* for barrett'?s/g, "")) ? "colo.screen" : "colo.dx");
  }
  const hasEgdWord = famAt.some(x => x.f === "egd"), hasEntero = famAt.some(x => x.f === "egd:entero");
  for (const f of fams) {
    if (f === "egd") { if (hasEgdWord || !hasEntero) add(draft.procs, "egd.dx"); if (hasEntero) add(draft.procs, "egd.entero"); }
    if (f === "fs") add(draft.procs, "fs.dx");
    if (f === "ercp") add(draft.procs, "ercp.dx");
    if (f === "para") add(draft.procs, therapeuticTap ? "para.ther" : "para.dx");
    if (f === "other") add(draft.procs, "other.ileo");
  }
  for (const c of txCodes) add(draft.procs, c);

  if (draft.procs.some(c => c === "colo.dx" || c === "colo.screen")) draft.reach = scopeReach(lower, used, mark);
  else for (const m of all(SCOPE_LM_RX)) {
    // A landmark in an upper or flex case is where something was, not a reach.
    if (!used[m.index] && !/^(?:ti|sf|hf|sig|desc)$/.test(m[0])) mark(m.index, m.index + m[0].length);
  }

  // Multi-word names and learned spellings ("cove all check") as phrases first.
  let aliasHit = null;
  for (const p of ctx.staff || []) {
    if (p.hidden) continue;
    const names = (p.aliases || []).concat(String(p.name || "").includes(",") ? [String(p.name).split(",").reverse().map(x => x.trim()).join(" ")] : []);
    for (const n of names) {
      const src = String(n).toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      if (!src || !/\s/.test(n)) continue;
      const m = phrase(src).exec(lower);
      if (m && !aliasHit) aliasHit = {id: p.id, a: m.index, b: m.index + m[0].length};
    }
  }
  // Staff: a cue ("with", "Dr.") and the words after it, or a known name anywhere.
  const words = [];
  const wrx = /[a-z][a-z'-]*/g;
  let wm;
  while ((wm = wrx.exec(lower))) words.push({w: wm[0], a: wm.index, b: wm.index + wm[0].length});
  const vocabWords = scopeVocabWords(), staff = ctx.staff || [];
  let best = aliasHit ? {r: {id: aliasHit.id, score: 4}, score: 4, a: aliasHit.a, b: aliasHit.b} : null;
  const consider = (tok, a, b, cue) => {
    if (SCOPE_STOP.has(tok) && !cue) return;
    const r = scopeStaffMatch(tok, staff);
    if (!r) return;
    const collide = vocabWords.has(scopeLetters(tok)) || SCOPE_STOP.has(tok);
    // With no cue, a misheard name counts only if it sounds like a long enough name.
    const loose = r.score >= 2 && scopeKey(tok).length >= 4;
    if (!cue && (collide || (r.score < 3 && !loose))) return;
    const score = r.score + (cue ? .5 : 0);
    if (!best || score > best.score) best = {r, score, a, b};
  };
  for (let i = 0; i < words.length; i++) {
    const x = words[i];
    if (used[x.a] && !SCOPE_STAFF_CUE.test(lower.slice(0, x.a))) continue;
    const cue = SCOPE_STAFF_CUE.test(lower.slice(0, x.a));
    consider(x.w, x.a, x.b, cue);
    const y = words[i + 1];
    if (y && y.a - x.b <= 1 && !SCOPE_STOP.has(y.w)) consider(x.w + y.w, x.a, y.b, cue);
  }
  if (best) {
    if (best.r.id) draft.staff = best.r.id; else draft.staffAlt = best.r.alts;
    draft.staffSaid = text.slice(best.a, best.b);
    mark(best.a, best.b);
  } else {
    // An unknown name after a cue becomes "New staff: ..." for the card.
    const cm = /(?:^|[^a-z])(?:with|dr\.?|doctor|attending|supervised by)\s+(?:dr\.?\s+|doctor\s+)?([a-z][a-z'-]+)(?:\s+([a-z][a-z'-]+))?/.exec(lower);
    if (cm) {
      const ok = w => w && !SCOPE_STOP.has(w) && !vocabWords.has(w) && !scopeFamsIn(w).length && w.length > 1;
      const w1 = ok(cm[1]) ? cm[1] : null, w2 = w1 && ok(cm[2]) && !scopeLmCode(cm[2]) ? cm[2] : null;
      if (w1) {
        const at = lower.indexOf(w1, cm.index);
        const orig = text.slice(at, at + w1.length + (w2 ? 1 + w2.length : 0));
        draft.staffHeard = orig.replace(/\b\w/g, c => c.toUpperCase());
        mark(at, at + orig.length);
      }
    }
  }
  for (const x of words) if (SCOPE_STAFF_CUE.test(lower.slice(0, x.b + 1)) && /^(?:with|dr|doctor|staff|attending)$/.test(x.w)) mark(x.a, x.b);

  // Why and found, longest phrases first within each list.
  const vocab = (list, into) => {
    for (const x of list) {
      if (!x.words) continue;
      for (const m of all(phrase(x.words))) {
        if (used[m.index] || used[m.index + m[0].length - 1]) continue;
        mark(m.index, m.index + m[0].length);
        add(into, x.code);
      }
    }
  };
  vocab(SCOPE_WHY.filter(x => !["ida", "crc", "surv", "fb"].includes(x.code)), draft.why);
  vocab(SCOPE_FOUND, draft.found);
  vocab(SCOPE_WHY.filter(x => ["ida", "crc", "surv", "fb"].includes(x.code)), draft.why);
  if (draft.procs.includes("egd.fb")) add(draft.why, "fb");
  // Screening words already made this a screening colonoscopy; say why only when it is one.
  if (draft.why.includes("crc") && !draft.procs.includes("colo.screen")) draft.why = draft.why.filter(c => c !== "crc");
  // An ulcer named by where it is.
  if (draft.found.includes("pud")) {
    if (/duoden|bulb/.test(lower)) { draft.found = draft.found.filter(c => c !== "pud"); add(draft.found, "du"); }
    else if (/gastric|stomach|antr|pylor|incisura/.test(lower)) { draft.found = draft.found.filter(c => c !== "pud"); add(draft.found, "gu"); }
  }
  if (draft.found.includes("gv")) draft.found = draft.found.filter(c => c !== "ev" || /esophageal/.test(lower));
  if (["uc", "crohns", "ischemic"].some(c => draft.found.includes(c))) draft.found = draft.found.filter(c => c !== "colitis");
  if (draft.found.length > 1) draft.found = draft.found.filter(c => c !== "normal");
  if (draft.procs.some(c => /\.(?:big)?poly$/.test(c))) add(draft.found, "polyp");
  // A bleed with no more specific reason: upper or lower by the procedure.
  const bleedWord = all(phrase("gi bleed(?:ing)?|bleed(?:ing|s)?|bled"));
  if (bleedWord.length) {
    for (const m of bleedWord) mark(m.index, m.index + m[0].length);
    if (!draft.why.some(c => ["hematemesis", "melena", "hematochezia", "ugib", "lgib", "ogib"].includes(c)))
      add(draft.why, draft.procs.some(c => c.startsWith("colo.") || c.startsWith("fs.")) ? "lgib" : "ugib");
  }


  // Whatever is left: shown on the card, never saved unless moved to the note.
  for (const x of words) {
    let cover = 0;
    for (let i = x.a; i < x.b; i++) cover += used[i];
    if (cover >= (x.b - x.a) / 2) continue;
    if (SCOPE_STOP.has(x.w) || x.w.length < 3 || SCOPE_NUMS[x.w]) continue;
    if (/^(?:cold|hot|snare|lesion|lesions|seen|mild|moderate|severe|grade|la|vessel|vessels|visible|clean|base|stigmata|extraction|extracted|sweep|swept|litres?|liters?|prep|retroflex\w*|photos?|pictures?|withdrawal|intubation|using|used|via)$/.test(x.w)) continue;
    draft.leftover.push(x.w);
  }
  return draft;
}

// The fellow's reach in a colonoscopy's words. Landmarks after "to", "got
// to", "reached" count; in a clause where staff take over, "at the X" is the
// reach and "to the X" is theirs; "a polyp in the transverse" is neither.
function scopeReach(lower, used, mark) {
  let mine = -1, handover = -1;
  let clauseStart = 0;
  const clauses = [];
  for (let i = 0; i <= lower.length; i++) if (i === lower.length || lower[i] === ",") { clauses.push([clauseStart, i]); clauseStart = i + 1; }
  for (const [a, b] of clauses) {
    const c = lower.slice(a, b);
    // Words after "staff took over" (dictation often has no commas) are the staff's part.
    SCOPE_TAKEOVER.lastIndex = 0;
    const tk = SCOPE_TAKEOVER.exec(c), from = tk ? tk.index : Infinity;
    for (const [code, rx] of SCOPE_COMPLETE) { rx.lastIndex = 0; let m; while ((m = rx.exec(c))) { if (m.index < from) mine = Math.max(mine, scopeRank(code)); mark(a + m.index, a + m.index + m[0].length); } }
    SCOPE_LM_RX.lastIndex = 0;
    let m;
    while ((m = SCOPE_LM_RX.exec(c))) {
      const code = scopeLmCode(m[1]), pre = c.slice(0, m.index), post = c.slice(m.index + m[0].length);
      mark(a + m.index, a + m.index + m[0].length);
      if (!code) continue;
      if (m.index > from) {
        if (/(?:^|[^a-z])(?:at|from|around|near|by)\s+(?:the\s+)?$/.test(pre)) handover = Math.max(handover, scopeRank(code));
        continue;
      }
      if (SCOPE_CUE_BEFORE.test(pre) || /^\s*(?:was\s+)?(?:intubated|reached)/.test(post)) mine = Math.max(mine, scopeRank(code));
    }
  }
  const r = mine >= 0 ? mine : handover;
  return r >= 0 ? SCOPE_REACH[r][0] : null;
}

// Dictation -> draft cases. ctx: {today, staff, learned}.
function scopeParse(text, ctx = {}) {
  const g = scopeGuard(text);
  const norm = scopeNormalize(g.text);
  const segs = scopeSegments(norm);
  const groups = [];
  for (const s of segs) {
    const lower = s.text.toLowerCase(), fams = scopeFamsIn(lower);
    const cur = groups[groups.length - 1];
    const again = SCOPE_AGAIN.test(lower);
    SCOPE_AGAIN.lastIndex = 0;
    const startNew = !cur || (s.sep && (cur.fams.length || cur.texts.length)) || (s.newSentence && fams.length && cur.fams.length);
    if (startNew) groups.push({texts: [s.text], fams: fams.slice(), again: again && !fams.length});
    else { cur.texts.push(s.text); for (const f of fams) if (!cur.fams.includes(f)) cur.fams.push(f); }
  }
  const cases = [];
  for (const gr of groups) {
    const d = scopeReadCase(gr.texts.join(", "), ctx);
    const prev = cases[cases.length - 1];
    if (gr.again && prev && !d.procs.length) {
      d.procs = prev.procs.slice(); d.reach = d.reach || prev.reach;
      if (!d.why.length) d.why = prev.why.slice();
      if (!d.found.length) d.found = prev.found.slice();
      d.leftover = d.leftover.filter(w => !/^(?:another|like|same|again)$/.test(w));
    }
    if (!d.procs.length && !d.staff && !d.staffHeard && !d.why.length && !d.found.length && !d.d && !d.site && !d.loc && prev) {
      // Nothing procedural: fold stray words into the case before.
      prev.leftover.push(...d.leftover);
      continue;
    }
    cases.push(d);
  }
  return {cases, removed: g.removed};
}

// ---- Carry-forward and inference ------------------------------------------------------------
// Date, staff, site and location carry from the case before (in the same
// dictation, or the last one saved for that day). Location defaults to the suite.
function scopeCarry(drafts, saved, today) {
  const out = [];
  let prev = null;
  const t = fmtDate(today);
  for (const d0 of drafts) {
    const d = {...d0, carried: {}};
    d.d = d.d || (prev ? prev.d : t);
    const last = prev && prev.d === d.d ? prev :
      (saved || []).filter(c => c.d === d.d).sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))[0] || null;
    for (const k of ["staff", "site", "loc"]) {
      if (k === "staff" && (d.staffHeard || (d.staffAlt && d.staffAlt.length))) continue;
      if (d[k] == null && last && last[k] != null) { d[k] = last[k]; d.carried[k] = true; }
    }
    if (!d.loc) d.loc = "suite";
    out.push(d);
    prev = d;
  }
  return out;
}
const SCOPE_URGENT_WHY = ["hematemesis", "melena", "hematochezia", "ugib", "lgib", "fb"];
function scopeIsStat(date) { return SCOPE_STAT_DAYS.includes(fmtDate(date)); }
// Urgency and, for a call case, the site. env: {now (ms), stretches, staff}.
function scopeInfer(draft, env = {}) {
  const d = {...draft};
  // Said wins; then the ED, the ICU, a bleed or a food bolus make it urgent.
  const bleedy = (d.why || []).some(w => SCOPE_URGENT_WHY.includes(w)) || (d.found || []).includes("active");
  if (d.urg === "elective" || d.urg === "urgent") { /* said */ }
  else if (d.loc === "ed" || d.loc === "icu" || bleedy) d.urg = "urgent";
  else d.urg = "elective";
  const now = env.now ? new Date(env.now) : null;
  if (!now || draft.urg === "elective") return d;
  const st = (env.stretches || []).find(s => s.s <= +now && +now < s.e);
  if (!st) return d;
  const h = now.getHours(), today = fmtDate(now), yest = fmtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const isCaseNow = d.d === today || (d.d === yest && h < 8);
  const offHours = h >= 19 || h < 8 || now.getDay() === 0 || now.getDay() === 6 || scopeIsStat(now);
  if (!isCaseNow || !offHours) return d;
  if (!draft.urg) d.urg = "urgent";
  if (!d.site && d.staff) {
    const p = (env.staff || []).find(x => x.id === d.staff), sur = p ? scopeLetters(String(p.name).split(",")[0]) : "";
    if (sur) for (const seg of st.segs || []) for (const [site] of [["hsc"], ["stb"]])
      if (seg[site] && seg[site].att && scopeLetters(seg[site].att).includes(sur)) { d.site = site; d.carried = {...(d.carried || {}), site: true}; }
  }
  return d;
}

// ---- Case helpers -----------------------------------------------------------------------------
const scopeFams = c => { const f = []; for (const p of c.procs || []) { const x = scopeFam(p); if (!f.includes(x)) f.push(x); }
  return f.sort((a, b) => SCOPE_FAMS.findIndex(x => x[0] === a) - SCOPE_FAMS.findIndex(x => x[0] === b)); };
const scopeHasBase = c => (c.procs || []).some(p => p === "colo.dx" || p === "colo.screen");
// "Colonoscopy to HF · polypectomy" / "EGD · biopsy, clip, injection"
function scopeSummary(c, o = {}) {
  const parts = [];
  for (const f of scopeFams(c)) {
    let head = scopeFamShort(f);
    if (f === "colo" && (c.procs || []).includes("colo.screen")) head = "Screening colonoscopy";
    if (f === "colo" && c.reach && scopeHasBase(c)) head += " to " + SCOPE_REACH_SAY[c.reach];
    if (f === "egd" && c.procs.includes("egd.entero") && !c.procs.includes("egd.dx")) head = "Push enteroscopy";
    if (f === "other") head = c.procs.includes("other.ileo") ? "Ileoscopy" : (c.otherLabel || "Other");
    if (f === "para") head = c.procs.includes("para.ther") ? "Paracentesis, therapeutic" : "Paracentesis";
    const tx = (c.procs || []).filter(p => scopeFam(p) === f && SCOPE_PROC[p] && !SCOPE_PROC[p].base && p !== "egd.entero")
      .map(p => SCOPE_PROC[p].label.toLowerCase().replace("apc", "APC").replace("peg", "PEG").replace("nj tube", "NJ tube").replace("barrett's", "Barrett's"));
    parts.push(head + (tx.length && !o.heads ? " · " + tx.join(", ") : ""));
  }
  return parts.join(" + ") || "No procedure yet";
}
const scopeC8 = c => { const s = new Set(); for (const p of c.procs || []) if (SCOPE_PROC[p] && SCOPE_PROC[p].c8) s.add(SCOPE_PROC[p].c8);
  if (s.has("polypectomy >1 cm")) s.add("polypectomy");
  if ((c.found || []).includes("active") && [...s].some(x => /hemostasis/.test(x))) s.add("actively bleeding");
  return s; };
// EPA parts a case could count toward.
function scopeEpaParts(c) {
  const out = [], f = scopeFams(c);
  if (f.includes("egd")) out.push("f3a");
  if (f.includes("fs") || (scopeHasBase(c) && c.reach)) out.push("f4");
  if (scopeHasBase(c)) out.push("c6");
  if (scopeC8(c).size) out.push("c8a");
  return out;
}
const scopeMissing = c => {
  const miss = [];
  if (!(c.procs || []).length) miss.push("procedure");
  if (scopeHasBase(c) && !c.reach) miss.push("reach");
  return miss;
};
function scopeId() { return "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const scopeByDate = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : String(a.ts || "").localeCompare(String(b.ts || "")));

// ---- Numbers ------------------------------------------------------------------------------------
const scopeIn = (c, from, to) => (!from || c.d >= from) && (!to || c.d <= to);
function scopeTotals(cases, from, to) {
  const t = {egd: 0, colo: 0, fs: 0, ercp: 0, para: 0, other: 0, cases: 0, procs: 0};
  for (const c of cases) {
    if (!scopeIn(c, from, to)) continue;
    t.cases++;
    for (const f of scopeFams(c)) { t[f]++; t.procs++; }
  }
  return t;
}
// Every colonoscopy the fellow drove, oldest first, with its reach.
function scopeReachSeries(cases) {
  return cases.filter(c => scopeHasBase(c) && c.reach).slice().sort(scopeByDate)
    .map((c, i) => ({i: i + 1, d: c.d, reach: c.reach, rank: scopeRank(c.reach), id: c.id}));
}
// Share of the last `win` colonoscopies (up to each one) reaching the cecum or TI.
function scopeCecumShare(series, win = 20) {
  const out = [];
  for (let k = 0; k < series.length; k++) {
    const w = series.slice(Math.max(0, k - win + 1), k + 1);
    out.push({i: series[k].i, d: series[k].d, share: Math.round(w.filter(x => x.rank >= 5).length / w.length * 100), n: w.length});
  }
  return out;
}
const SCOPE_C8 = [["variceal hemostasis", "Variceal hemostasis", 3], ["non-variceal hemostasis", "Non-variceal hemostasis", 8],
  ["dilations", "Dilation", 2], ["polypectomy", "Polypectomy", 10], ["polypectomy >1 cm", "Polyp over 1 cm", 5],
  ["foreign body", "Foreign body", 2], ["actively bleeding", "Actively bleeding", 4]];
// Therapeutic case mix against C8's minimums; observed = checklist lines ticked.
function scopeTherapy(cases, items, lineVal) {
  return SCOPE_C8.map(([stem, label, min]) => {
    const done = cases.filter(c => scopeC8(c).has(stem)).length;
    const lines = (items || []).filter(it => it.id && it.label.replace(/^\d+\s+/, "") === stem);
    const observed = lines.filter(it => (lineVal ? lineVal(it.id) : 0) >= (it.target || 1)).length;
    return {stem, label, min, done, observed};
  });
}
const SCOPE_FIRSTS = [
  ["First procedure logged", () => true],
  ["First colonoscopy you drove", c => scopeHasBase(c)],
  ["First colonoscopy to the cecum", c => scopeHasBase(c) && scopeRank(c.reach) >= 5],
  ["First terminal ileum intubation", c => scopeHasBase(c) && c.reach === "ti"],
  ["First flex sig", c => scopeFams(c).includes("fs")],
  ["First polypectomy", c => scopeC8(c).has("polypectomy")],
  ["First polyp over 1 cm", c => scopeC8(c).has("polypectomy >1 cm")],
  ["First non-variceal hemostasis", c => scopeC8(c).has("non-variceal hemostasis")],
  ["First variceal hemostasis", c => scopeC8(c).has("variceal hemostasis")],
  ["First dilation", c => scopeC8(c).has("dilations")],
  ["First foreign body removal", c => scopeC8(c).has("foreign body")],
  ["First PEG", c => (c.procs || []).includes("egd.peg")],
  ["First ERCP", c => scopeFams(c).includes("ercp")],
  ["First paracentesis", c => scopeFams(c).includes("para")],
];
function scopeFirsts(cases) {
  const sorted = cases.slice().sort(scopeByDate), out = [];
  for (const [label, test] of SCOPE_FIRSTS) {
    const c = sorted.find(test);
    if (c) out.push({label, d: c.d, id: c.id});
  }
  return out;
}
function scopeBreadth(cases, from, to, staff) {
  const inR = cases.filter(c => scopeIn(c, from, to));
  const count = key => { const m = {}; for (const c of inR) { const k = c[key] || "none"; m[k] = (m[k] || 0) + 1; } return m; };
  const byStaff = count("staff");
  const staffRows = Object.keys(byStaff).map(id => {
    const p = (staff || []).find(x => x.id === id);
    return {id, name: p ? p.name : "Not recorded", n: byStaff[id]};
  }).sort((a, b) => (a.id === "none") - (b.id === "none") || b.n - a.n || a.name.localeCompare(b.name));
  return {n: inR.length, staff: staffRows, site: count("site"), loc: count("loc"), urg: count("urg")};
}
function scopeWeek(cases, from, to) {
  const inR = cases.filter(c => scopeIn(c, from, to));
  let far = -1;
  for (const c of inR) if (scopeHasBase(c) && c.reach) far = Math.max(far, scopeRank(c.reach));
  return {n: inR.length, procs: inR.reduce((a, c) => a + scopeFams(c).length, 0), furthest: far >= 0 ? SCOPE_REACH[far][0] : null};
}
// What changed since a date: new cases and colonoscopies, and the cecum share then and now.
function scopeChange(cases, since) {
  const series = scopeReachSeries(cases);
  const share = s => { const w = s.slice(-20); return w.length ? Math.round(w.filter(x => x.rank >= 5).length / w.length * 100) : null; };
  const before = since ? series.filter(x => x.d < since) : [];
  const after = cases.filter(c => !since || c.d >= since);
  return {cases: after.length, procs: after.reduce((a, c) => a + scopeFams(c).length, 0),
    colos: series.filter(x => !since || x.d >= since).length, shareNow: share(series), shareThen: since ? share(before) : null,
    colosTotal: series.length};
}

// ---- Spreadsheet -------------------------------------------------------------------------------
function scopeTresCodes(c) {
  return (c.procs || []).map(p => {
    const x = SCOPE_PROC[p];
    if (!x) return p;
    if ((p === "colo.dx" || p === "colo.screen") && c.reach) return x.tres + ": To " + SCOPE_TRES_REACH[c.reach];
    if (p === "other.x" && c.otherLabel) return "Other: " + c.otherLabel;
    return x.tres;
  });
}
function scopeCSV(cases, staff) {
  const q = v => { const s = String(v == null ? "" : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const name = id => { const p = (staff || []).find(x => x.id === id); return p ? p.name : ""; };
  const site = k => (SCOPE_SITES.find(x => x[0] === k) || [, ""])[1];
  const loc = k => (SCOPE_LOCS.find(x => x[0] === k) || [, ""])[1];
  const rows = [["Date", "Procedure", "Procedure codes", "How far (colonoscopy)", "Why", "Found", "Staff", "Site", "Location", "Urgency", "Note"]];
  for (const c of cases.slice().sort(scopeByDate)) {
    rows.push([c.d, scopeFams(c).map(scopeFamLabel).join(" + "), scopeTresCodes(c).join("; "),
      scopeHasBase(c) && c.reach ? scopeReachLabel(c.reach) : "", (c.why || []).map(scopeWhyLabel).join("; "),
      (c.found || []).map(scopeFoundLabel).join("; "), name(c.staff), site(c.site), loc(c.loc),
      c.urg === "urgent" ? "Urgent" : c.urg === "elective" ? "Elective" : "", c.note || ""]);
  }
  return "﻿" + rows.map(r => r.map(q).join(",")).join("\r\n") + "\r\n";
}

// ---- Import ------------------------------------------------------------------------------------
// Merges a {kind: "gi-scopes"} file: staff by name, cases by id (again is harmless).
function scopeImport(scopes, file) {
  if (!file || file.kind !== "gi-scopes" || !Array.isArray(file.cases))
    return {ok: false, error: "That isn't a GI Hub cases file."};
  const next = JSON.parse(JSON.stringify(scopes));
  const idMap = {};
  let staffAdded = 0, added = 0, skipped = 0;
  for (const p of file.staff || []) {
    const hit = next.staff.find(x => scopeLetters(x.name) === scopeLetters(p.name));
    if (hit) { idMap[p.id] = hit.id; for (const a of p.aliases || []) if (!hit.aliases.includes(a)) hit.aliases.push(a); continue; }
    const id = next.staff.some(x => x.id === p.id) ? "s" + scopeId() : p.id;
    next.staff.push({id, name: p.name, aliases: (p.aliases || []).slice(), hidden: !!p.hidden});
    idMap[p.id] = id; staffAdded++;
  }
  const have = new Set(next.cases.map(c => c.id)), fresh = [];
  for (const c of file.cases) {
    if (!c || !c.id || !/^\d{4}-\d{2}-\d{2}$/.test(c.d || "")) { skipped++; continue; }
    if (have.has(c.id)) { skipped++; continue; }
    next.cases.push({id: c.id, d: c.d, staff: c.staff ? idMap[c.staff] || null : null, site: c.site || null, loc: c.loc || null,
      urg: c.urg || null, procs: (c.procs || []).filter(p => SCOPE_PROC[p]), reach: c.reach || null, why: (c.why || []).slice(),
      found: (c.found || []).slice(), note: c.note || "", src: "import", ts: c.ts || c.d + "T12:00:00.000Z"});
    fresh.push(next.cases[next.cases.length - 1]); have.add(c.id); added++;
  }
  scopeFillSites(fresh);
  return {ok: true, added, skipped, staffAdded, next};
}
// ---- EPA links ---------------------------------------------------------------------------------
// An observation added from a case carries the case's id in `src`, so the
// case can show what it already added instead of offering it again.
const SCOPE_EPA_NOTE = "From scope log: ";
// Staff go by surname alone ("Brook"); forms saved before that may say "Dr. Brook".
const scopeBare = s => String(s || "").trim().replace(/^(?:dr\.?|doctor)\s+/i, "");
const scopeStaffName = (staff, id) => { const p = (staff || []).find(x => x.id === id); return p ? String(p.name || "").split(",")[0].trim() : ""; };
// {caseId: [{pid, i, status, a}]} for every observation that came from a case.
function scopeSentMap(obsByPart) {
  const m = {};
  for (const pid of Object.keys(obsByPart || {})) (obsByPart[pid] || []).forEach((o, i) => {
    if (o && o.src) (m[o.src] ||= []).push({pid, i, status: o.status || "pending", a: o.a || ""});
  });
  return m;
}
// Observations added from cases before the link existed are matched to their
// case by date, staff and EPA. Returns how many were linked.
function scopeLinkEpas(cases, obsByPart, staff) {
  let n = 0;
  for (const pid of Object.keys(obsByPart || {})) {
    const list = obsByPart[pid] || [], taken = new Set(list.map(o => o && o.src).filter(Boolean));
    for (const o of list) {
      if (!o || o.src || typeof o.n !== "string" || !o.n.startsWith(SCOPE_EPA_NOTE)) continue;
      const fits = (cases || []).filter(c => c.d === o.d && !taken.has(c.id) && scopeEpaParts(c).includes(pid) && (!o.a || scopeStaffName(staff, c.staff).toLowerCase() === scopeBare(o.a).toLowerCase()));
      const hit = fits.find(c => SCOPE_EPA_NOTE + scopeSummary(c) === o.n) || fits[0];
      if (hit) { o.src = hit.id; taken.add(hit.id); n++; }
    }
  }
  return n;
}
// Who a form with no assessor was probably with: the staff on that day's
// cases, the cases that fit the EPA first. `fit` says which it was.
function scopeStaffOn(cases, iso, pid) {
  const day = (cases || []).filter(c => c.d === iso && c.staff), fit = day.filter(c => scopeEpaParts(c).includes(pid));
  const ids = [];
  for (const c of fit.length ? fit : day) if (!ids.includes(c.staff)) ids.push(c.staff);
  return {ids, fit: fit.length > 0};
}
// The site a consult block is at ("Consults SBH" is St. Boniface), or null
// for blocks named after a service rather than a hospital.
function scopeBlockSite(iso) {
  const b = /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? blockFor(new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8), 12)) : null;
  if (!b) return null;
  return /\bHSC\b/.test(b.name) ? "hsc" : /\bSBH\b/.test(b.name) ? "stb" : /\bGrace\b/.test(b.name) ? "grace" : null;
}
// T-Res had no site, so imported cases take their block's hospital. Only an
// empty site is filled; returns how many cases changed.
function scopeFillSites(cases) {
  let n = 0;
  for (const c of cases) if (c.src === "import" && !c.site) { const s = scopeBlockSite(c.d); if (s) { c.site = s; n++; } }
  return n;
}
