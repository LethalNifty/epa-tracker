"use strict";
// GI Hub IBD drugs: one card per IBD drug sold in Canada, the work-up before
// advanced therapy, vaccines, and patient situations, each line tagged with
// its source. Written in our own words from the Health Canada monographs and
// the guidelines named in IBD_SRC; nothing is quoted. Pure: no DOM and no
// Store. Loaded after guides.js and before ibd-view.js.

const IBD_CHECKED = "2026-10-10";

// Sources: w is the short tag shown beside a line. Health Canada monographs
// link to the Drug Product Database page, which always opens the newest one.
const IBD_DPD = code => "https://health-products.canada.ca/dpd-bdpp/info?lang=eng&code=" + code;
const IBD_SRC = {
  hcPentasa: {w: "HC", t: "Pentasa monograph", d: "2026-04-16", u: IBD_DPD(16855)},
  hcMezavant: {w: "HC", t: "Mezavant monograph", d: "2025-12-11", u: IBD_DPD(78289)},
  hcSalaz: {w: "HC", t: "Salazopyrin monograph", d: "2020-10-19", u: IBD_DPD(17417)},
  hcEntocort: {w: "HC", t: "Entocort capsules monograph", d: "2023-03-09", u: IBD_DPD(43534)},
  hcEntEnema: {w: "HC", t: "Entocort Enema monograph", d: "2023-03-31", u: IBD_DPD(16264)},
  hcCortiment: {w: "HC", t: "Cortiment monograph", d: "2018-05-23", u: IBD_DPD(94275)},
  hcUceris: {w: "HC", t: "Uceris rectal foam monograph", d: "2020-04-15", u: IBD_DPD(98785)},
  hcImuran: {w: "HC", t: "Imuran monograph", d: "2026-09-09", u: IBD_DPD(1192)},
  hcPurinethol: {w: "HC", t: "Purinethol monograph", d: "2023-03-23", u: IBD_DPD(960)},
  hcMetoject: {w: "HC", t: "Metoject monograph", d: "2024-09-10", u: IBD_DPD(94144)},
  hcNeoral: {w: "HC", t: "Neoral and Sandimmune monograph", d: "2026-07-30", u: IBD_DPD(17814)},
  hcRemicade: {w: "HC", t: "Remicade monograph", d: "2025-01-30", u: IBD_DPD(67959)},
  hcRemsimaSC: {w: "HC", t: "Remsima SC monograph", d: "2024-06-28", u: IBD_DPD(100077)},
  hcHumira: {w: "HC", t: "Humira monograph", d: "2022-09-16", u: IBD_DPD(74379)},
  hcSimponi: {w: "HC", t: "Simponi monograph", d: "2026-04-07", u: IBD_DPD(81020)},
  hcCimzia: {w: "HC", t: "Cimzia monograph", d: "2019-11-13", u: IBD_DPD(81737)},
  hcEntyvio: {w: "HC", t: "Entyvio monograph", d: "2023-11-17", u: IBD_DPD(92117)},
  hcStelara: {w: "HC", t: "Stelara monograph", d: "2024-08-14", u: IBD_DPD(80608)},
  hcSkyrizi: {w: "HC", t: "Skyrizi monograph", d: "2026-07-08", u: IBD_DPD(100855)},
  hcOmvoh: {w: "HC", t: "Omvoh monograph", d: "2026-06-16", u: IBD_DPD(102858)},
  hcTremfya: {w: "HC", t: "Tremfya monograph", d: "2026-08-14", u: IBD_DPD(95860)},
  hcXeljanz: {w: "HC", t: "Xeljanz monograph", d: "2026-04-09", u: IBD_DPD(90863)},
  hcRinvoq: {w: "HC", t: "Rinvoq monograph", d: "2026-07-14", u: IBD_DPD(98509)},
  hcZeposia: {w: "HC", t: "Zeposia monograph", d: "2024-08-28", u: IBD_DPD(99535)},
  hcVelsipity: {w: "HC", t: "Velsipity monograph", d: "2026-02-12", u: IBD_DPD(103353)},

  cag21l: {w: "CAG", y: 2021, t: "IBD immunizations, part 1: live vaccines", u: "https://doi.org/10.1093/jcag/gwab015"},
  cag21i: {w: "CAG", y: 2021, t: "IBD immunizations, part 2: inactivated vaccines", u: "https://doi.org/10.1093/jcag/gwab016"},
  cag19: {w: "CAG", y: 2019, t: "Luminal Crohn's disease", u: "https://doi.org/10.1093/jcag/gwz019"},
  cag18: {w: "CAG", y: 2018, t: "Perianal fistulizing Crohn's (Toronto consensus)", u: "https://doi.org/10.1093/jcag/gwy047"},
  cag16p: {w: "CAG", y: 2016, t: "IBD in pregnancy (Toronto consensus)", u: "https://doi.org/10.1053/j.gastro.2015.12.003"},
  cag15: {w: "CAG", y: 2015, t: "Nonhospitalized UC (Toronto consensus)", u: "https://doi.org/10.1053/j.gastro.2015.03.001"},
  naciz: {w: "NACI", y: 2025, t: "Herpes zoster vaccine for adults who are immunocompromised",
    u: "https://www.canada.ca/en/public-health/services/publications/vaccines-immunization/national-advisory-committee-immunization-summary-updated-recommendations-herpes-zoster-vaccination-adults-immunocompromised.html"},
  nacip: {w: "NACI", y: 2024, t: "Pneumococcal vaccines in adults, including Pneu-C-21",
    u: "https://www.canada.ca/en/public-health/services/publications/vaccines-immunization/national-advisory-committee-immunization-statement-recommendations-use-pneumococcal-vaccines-adults-pneu-c-21.html"},
  nacir: {w: "NACI", y: 2026, t: "RSV vaccines for older adults and adults at high risk",
    u: "https://www.canada.ca/en/public-health/services/publications/vaccines-immunization/national-advisory-committee-immunization-summary-updated-guidance-respiratory-syncytial-virus-vaccines-older-adults-high-risk-severe-rsv-disease.html"},
  cts: {w: "CTS", y: 2022, t: "Canadian Tuberculosis Standards, chapter 4: diagnosing TB infection",
    u: "https://www.canada.ca/en/public-health/services/diseases/tuberculosis/health-professionals/canadian-tuberculosis-standards/diagnosis-tuberculosis-infection.html"},
  casl: {w: "CASL", y: 2025, t: "Chronic hepatitis B (CASL and AMMI 2025 update)", u: "https://doi.org/10.3138/canlivj-2025-0012-e"},

  aga25h: {w: "AGA", y: 2025, t: "Hepatitis B reactivation: prevention and treatment", u: "https://doi.org/10.1053/j.gastro.2024.11.008"},
  aga24uc: {w: "AGA", y: 2024, t: "Moderate-to-severe UC: drug treatment (living; March 2026 review made no changes)", u: "https://doi.org/10.1053/j.gastro.2024.10.001"},
  aga25cd: {w: "AGA", y: 2025, t: "Moderate-to-severe Crohn's: drug treatment (living; March 2026 review made no changes)", u: "https://doi.org/10.1053/j.gastro.2025.09.038"},
  aga20: {w: "AGA", y: 2020, t: "Moderate-to-severe UC, including acute severe UC", u: "https://www.gastrojournal.org/article/S0016-5085(20)30018-4/fulltext"},
  aga19: {w: "AGA", y: 2019, t: "Mild-to-moderate UC", u: "https://doi.org/10.1053/j.gastro.2018.12.009"},
  aga17: {w: "AGA", y: 2017, t: "Therapeutic drug monitoring in IBD", u: "https://doi.org/10.1053/j.gastro.2017.07.032"},
  aga20old: {w: "AGA", y: 2020, t: "IBD in older adults (clinical practice update)", u: "https://doi.org/10.1053/j.gastro.2020.08.060"},
  acg25uc: {w: "ACG", y: 2025, t: "Ulcerative colitis in adults", u: "https://doi.org/10.14309/ajg.0000000000003463"},
  acg25cd: {w: "ACG", y: 2025, t: "Crohn's disease in adults", u: "https://doi.org/10.14309/ajg.0000000000003465"},
  acg25p: {w: "ACG", y: 2025, t: "Preventive care in IBD", u: "https://doi.org/10.14309/ajg.0000000000003541"},
  gc25: {w: "GC", y: 2025, t: "Global consensus on pregnancy in IBD (ACG copy)", u: "https://doi.org/10.14309/ajg.0000000000003651"},
  cpic: {w: "CPIC", y: 2025, t: "Thiopurine dosing by TPMT and NUDT15 (2025 update)", u: "https://doi.org/10.1002/cpt.70209"},
  acr15: {w: "ACR", y: 2015, t: "Rheumatoid arthritis guideline: TB screening before biologics"},
  ecco: {w: "ECCO", t: "ECCO e-guide (European; used where no Canadian or US source gives the detail)", u: "https://e-guide.ecco-ibd.eu/"},
  trial: {w: "Trial", t: "Methotrexate trials in Crohn's (Feagan, NEJM 1995 and 2000)",
    u: "https://pubmed.ncbi.nlm.nih.gov/?term=Feagan+methotrexate+Crohn%27s+disease+N+Engl+J+Med"},
  prac: {w: "Practice", t: "Common practice: a routine step with no specific guideline line behind it"},
};

// Drug classes, in the order the list shows them. hue names a colour token.
const IBD_CLASSES = [
  {id: "asa", n: "5-ASA", hue: "wli", how: "Works on the colonic lining"},
  {id: "ster", n: "Corticosteroids", hue: "capillary", how: "Broad anti-inflammatory"},
  {id: "imm", n: "Immunomodulators", hue: "dim", how: "Slow, broad immune suppression"},
  {id: "cni", n: "Calcineurin inhibitor", hue: "capillary", how: "Blocks T-cell activation"},
  {id: "tnf", n: "Anti-TNF", hue: "mucosa", how: "Neutralizes TNF"},
  {id: "itg", n: "Anti-integrin", hue: "nbi", how: "Stops lymphocytes homing to the gut"},
  {id: "il", n: "IL-12/23 and IL-23", hue: "ttp", how: "Blocks IL-23 signalling"},
  {id: "jak", n: "JAK inhibitors", hue: "flu", how: "Blocks cytokine signals inside the cell"},
  {id: "s1p", n: "S1P modulators", hue: "core", how: "Keeps lymphocytes in the lymph nodes"},
];

// The work-up items every advanced therapy shares. Each drug lists the ones it
// needs (before.base) and adds its own (before.extra).
const IBD_BASE = {
  tb: ["TB: IGRA or tuberculin skin test (5 mm counts as positive before a biologic); chest X-ray if either is positive", "cts"],
  hbv: ["Hepatitis B: HBsAg, anti-HBc and anti-HBs", "casl aga25h"],
  hcv: ["Hepatitis C antibody and HIV test (trials excluded both infections)", "hcOmvoh prac"],
  vzv: ["Varicella immunity: chickenpox history or 2 vaccine doses; if neither, VZV IgG", "acg25p hcZeposia"],
  cbc: ["CBC", "prac"],
  liver: ["ALT, ALP and bilirubin", "prac"],
  renal: ["Creatinine (eGFR)", "prac"],
  preg: ["Pregnancy test if pregnancy is possible", "prac"],
};
const IBD_ADV = ["tb", "hbv", "hcv", "vzv", "cbc", "liver", "renal", "preg"];
// The same tests as a clinic note lists them.
const IBD_ORDER = {tb: "IGRA (or TST); chest X-ray if positive", hbv: "HBsAg, anti-HBc, anti-HBs", hcv: "HCV antibody, HIV",
  vzv: "VZV IgG if immunity is uncertain", cbc: "CBC", liver: "ALT, ALP, bilirubin", renal: "Creatinine", preg: "Pregnancy test if applicable"};

const IBD_DRUGS = [
  // ---- 5-ASA ------------------------------------------------------------------------------
  {id: "mesalamine", cls: "asa", n: "Mesalamine (5-ASA)",
    brands: "Mezavant, Mezera, Octasa, Pentasa, Salofalk and generics; Pentasa and Salofalk enemas and suppositories",
    dz: ["uc"], route: ["oral", "rectal"], k: "5asa 5-aminosalicylic acid mesalazine asacol",
    how: ["Acts on the colonic lining; little of it reaches the blood.", "hcMezavant"],
    use: [
      ["First line for mild to moderate UC, to induce and to maintain remission.", "aga19 cag15"],
      ["Proctitis: a 1 g suppository nightly. Left-sided disease: add enemas to oral therapy.", "cag15 aga19"],
      ["Crohn's: CAG advises against it, for induction or maintenance.", "cag19"],
      ["Moderate to severe UC: once 5-ASA has failed and an immunomodulator or advanced therapy is started, stopping 5-ASA is suggested.", "aga24uc"],
    ],
    dose: [
      ["Oral 2 to 3 g once daily. Partial response: above 3 g, plus rectal therapy.", "aga19"],
      ["Mezavant: 2.4 to 4.8 g once daily with food to induce, 2.4 g to maintain.", "hcMezavant"],
      ["Suppository 1 g at bedtime. Enema 1 to 4 g at bedtime.", "hcPentasa"],
      ["Judge the response at 4 to 8 weeks.", "cag15"],
    ],
    avoid: [
      ["Allergy to salicylates, including ASA.", "hcMezavant"],
      ["Severe kidney impairment (GFR under 30) or severe liver impairment.", "hcMezavant"],
      ["Acute intolerance in about 3%: cramps, bloody diarrhea and fever that mimic a flare. Stop it.", "hcMezavant"],
      ["Interstitial nephritis and kidney stones are rare; keep fluid intake up.", "hcMezavant"],
    ],
    preg: [["Continue through pregnancy and breastfeeding.", "gc25"]],
    before: {base: ["renal"], extra: []},
    monitor: [["Kidney function before starting, then periodically.", "hcMezavant"]],
    differ: [["Pentasa still carries a Canadian label for mild to moderate Crohn's; CAG 2019 advises against 5-ASA in Crohn's.", "hcPentasa cag19"]],
  },
  {id: "sulfasalazine", cls: "asa", n: "Sulfasalazine",
    brands: "Salazopyrin, Salazopyrin EN-tabs and generics",
    dz: ["uc"], route: ["oral"], k: "salazopyrin sulfa",
    how: ["5-ASA joined to sulfapyridine. Colonic bacteria split them; the sulfa half causes most side effects.", "hcSalaz"],
    use: [
      ["Mild to moderate UC. Reasonable if already in remission on it, or if arthritis is prominent.", "aga19"],
      ["Standard-dose mesalamine is preferred over it for extensive UC.", "aga19"],
    ],
    dose: [
      ["Build up over the first weeks. Flares: 1 g three or four times daily. Maintenance: 1 g two or three times daily.", "hcSalaz"],
      ["Side effects climb at 4 g a day or more.", "hcSalaz"],
    ],
    avoid: [
      ["Sulfonamide or salicylate allergy; asthma or hives set off by ASA or NSAIDs.", "hcSalaz"],
      ["Porphyria, intestinal or urinary obstruction, severe kidney impairment.", "hcSalaz"],
      ["Reversible low sperm count and infertility in men; recovers 2 to 3 months after stopping.", "hcSalaz"],
      ["Lowers folate.", "hcSalaz"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Add a folate supplement, since it lowers folate. Care breastfeeding a premature or G6PD-deficient baby.", "hcSalaz"],
    ],
    before: {base: ["cbc", "liver", "renal"], extra: [["Urinalysis", "hcSalaz"]]},
    monitor: [
      ["CBC with differential and liver tests every 2 weeks for 3 months, monthly for the next 3, then every 3 months.", "hcSalaz"],
      ["Kidney function and urinalysis monthly for the first 3 months.", "hcSalaz"],
    ],
    differ: [["The Canadian label also lists Crohn's as adjunct use; CAG 2019 advises against it to maintain Crohn's remission.", "hcSalaz cag19"]],
  },

  // ---- Corticosteroids ---------------------------------------------------------------------
  {id: "budesonide", cls: "ster", n: "Budesonide",
    brands: "Entocort (ileal-release capsules), Cortiment (MMX tablets), Entocort Enema, Uceris rectal foam",
    dz: ["uc", "cd"], route: ["oral", "rectal"], k: "mmx steroid",
    how: ["A steroid the liver mostly clears on first pass, so less reaches the body.", "hcEntocort"],
    use: [
      ["Mild to moderate ileal or right-colon Crohn's: Entocort to induce remission.", "cag19 hcEntocort"],
      ["Not for maintaining Crohn's remission.", "cag19"],
      ["Mild to moderate UC: Cortiment to induce. Distal UC: the enema or the foam.", "hcCortiment hcEntEnema hcUceris"],
    ],
    dose: [
      ["Entocort 9 mg each morning before food, up to 8 weeks; then 6 mg daily for up to 3 months, then taper.", "hcEntocort"],
      ["Cortiment 9 mg each morning, up to 8 weeks.", "hcCortiment"],
      ["Entocort Enema nightly for 4 weeks, up to 8. Uceris foam twice daily for 2 weeks, then daily for 4.", "hcEntEnema hcUceris"],
    ],
    avoid: [
      ["Active TB or other untreated infection.", "hcEntocort hcUceris"],
      ["Ketoconazole and other strong CYP3A inhibitors raise exposure 4 to 7 times.", "hcEntocort"],
      ["Cirrhosis raises the amount that reaches the body.", "hcEntocort"],
      ["Switching from systemic steroids: watch for adrenal insufficiency.", "hcEntocort"],
    ],
    preg: [["Steroids can be used in pregnancy when needed, and while breastfeeding.", "gc25"]],
    before: {base: [], extra: [["Ask about TB exposure and current infection", "hcEntocort"]]},
    monitor: [["Long courses: consider checking adrenal function.", "hcEntocort"]],
  },
  {id: "steroids", cls: "ster", n: "Prednisone and IV steroids",
    brands: "Prednisone; IV methylprednisolone (Solu-Medrol) or hydrocortisone (Solu-Cortef)",
    dz: ["uc", "cd"], route: ["oral", "iv"], k: "corticosteroid prednisolone methylprednisolone hydrocortisone asuc acute severe",
    how: ["Broad anti-inflammatory and immune suppression.", "cag15"],
    use: [
      ["Induce remission in moderate to severe UC or Crohn's; never to maintain it.", "cag15 cag19"],
      ["Guidelines favour starting advanced therapy early over repeated steroid courses.", "aga24uc aga25cd"],
      ["Acute severe UC: IV steroids; rescue with infliximab or cyclosporine if there is no response by day 3.", "acg25uc aga20"],
    ],
    dose: [
      ["Acute severe UC: methylprednisolone 40 to 60 mg a day IV, or equivalent; higher doses add nothing.", "aga20"],
      ["Outpatients: no guideline fixes the dose or taper. Prednisone 40 mg daily, tapered by about 5 mg a week, is common.", "prac"],
      ["Reassess oral steroids at about 2 weeks.", "cag15"],
    ],
    avoid: [
      ["20 mg prednisone or more for 2 weeks or longer counts as immunosuppressed for live vaccines.", "cag21l"],
      ["10 mg or more for 4 weeks or longer: high hepatitis B reactivation risk if HBsAg-positive, moderate if anti-HBc only.", "aga25h"],
      ["15 mg or more for 2 to 4 weeks can make TB skin tests falsely negative, so test first when you can.", "cts"],
      ["With 2 other immunosuppressants, or with a calcineurin inhibitor: consider PJP prophylaxis.", "ecco"],
    ],
    preg: [["Can be used in pregnancy when needed; breastfeeding is fine.", "gc25"]],
    before: {base: ["hbv"], extra: [["TB test before a long course, if time allows", "cts"]]},
    monitor: [["Bone density with long or repeated courses or other osteoporosis risks.", "acg25p"]],
    differ: [["The PJP prophylaxis rule comes from ECCO (European); the Canadian and US IBD guidelines here give no threshold.", "ecco"]],
  },

  // ---- Immunomodulators --------------------------------------------------------------------
  {id: "thiopurines", cls: "imm", n: "Azathioprine and mercaptopurine",
    brands: "Imuran and generics (azathioprine); Purinethol and generics (mercaptopurine, 6-MP)",
    off: "Off-label for IBD in Canada: labelled for transplant and rheumatoid arthritis (azathioprine) and leukemia (6-MP).",
    dz: ["uc", "cd"], route: ["oral"], k: "thiopurine aza 6mp 6-mp tpmt nudt15 imuran purinethol",
    how: ["Purine antimetabolites that suppress lymphocytes.", "hcImuran hcPurinethol"],
    use: [
      ["Maintenance after steroid-induced remission; not for induction on its own.", "aga24uc aga25cd cag15 cag19"],
      ["With infliximab: the combination beats either drug alone in thiopurine-naive patients.", "aga25cd acg25cd acg25uc"],
      ["Crohn's: after 6 months of steroid-free remission on combination therapy, the thiopurine can be withdrawn.", "aga25cd"],
    ],
    dose: [
      ["Standard start: azathioprine 2 mg/kg/day; mercaptopurine 1.5 mg/kg/day.", "cpic"],
      ["TPMT or NUDT15 intermediate: start at 30 to 80% of standard. Both intermediate: 20 to 50%. Poor metabolizer: use another drug.", "cpic"],
      ["On allopurinol: cut azathioprine to a quarter of the dose.", "hcImuran"],
      ["Steady state takes 2 to 4 weeks after each change.", "cpic"],
    ],
    avoid: [
      ["TPMT or NUDT15 poor metabolizers: severe, possibly fatal marrow suppression.", "cpic hcImuran"],
      ["Allopurinol without a dose cut.", "hcImuran"],
      ["5-ASA inhibits TPMT and can deepen marrow suppression.", "hcImuran"],
      ["Lymphoma risk rises with age. Hepatosplenic T-cell lymphoma: mostly young men also on an anti-TNF.", "aga20old hcRemicade"],
      ["Non-melanoma skin cancer: sun protection and yearly skin checks.", "acg25p"],
      ["Rare liver injury, including non-cirrhotic portal hypertension.", "hcImuran"],
    ],
    preg: [["Continue through pregnancy and breastfeeding. Watch liver tests for cholestasis; consider split dosing.", "gc25"]],
    before: {base: ["cbc", "liver", "hbv", "vzv", "preg"], extra: [["TPMT (activity or genotype) and NUDT15 genotype", "aga17 cpic hcImuran"]]},
    monitor: [
      ["CBC with platelets weekly for 4 weeks, every 2 weeks in months 2 and 3, then monthly.", "hcImuran"],
      ["Liver tests routinely.", "hcImuran"],
      ["Metabolites only for active disease or suspected toxicity: 6-TGN 230 to 450 pmol per 8×10⁸ RBC on monotherapy.", "aga17"],
      ["Yearly skin check.", "acg25p"],
    ],
    differ: [["TPMT testing: AGA suggests it routinely; the label says to consider it and still monitor counts, since testing misses some.", "aga17 hcImuran"]],
  },
  {id: "mtx", cls: "imm", n: "Methotrexate",
    brands: "Metoject (subcutaneous) and generic injection and tablets",
    off: "Off-label for IBD in Canada: labelled for rheumatoid arthritis and psoriasis.",
    dz: ["cd"], route: ["sc", "oral"], k: "mtx metoject folate",
    how: ["Folate antagonist; anti-inflammatory at once-weekly doses.", "hcMetoject"],
    use: [
      ["Crohn's: subcutaneous or intramuscular, to induce and maintain, especially if steroid-dependent. Oral is not recommended.", "aga25cd cag19"],
      ["UC: not recommended on its own.", "aga24uc"],
      ["A partner for anti-TNF combination therapy.", "cag15 cag18"],
    ],
    dose: [
      ["Crohn's: 25 mg once weekly by injection (SC or IM) to induce, over 16 weeks in the trial, then 15 mg weekly.", "trial"],
      ["Folic acid on a different day, often 5 mg once weekly.", "prac"],
    ],
    avoid: [
      ["Pregnancy, and breastfeeding. Exclude pregnancy before starting.", "hcMetoject"],
      ["Severe kidney impairment or dialysis.", "hcMetoject"],
      ["Alcohol use disorder or chronic liver disease; existing blood dyscrasia or immunodeficiency.", "hcMetoject"],
      ["Nitrous oxide anesthesia.", "hcMetoject"],
    ],
    preg: [
      ["Contraindicated. Stop 1 to 3 months before trying to conceive.", "gc25"],
      ["Label: avoid pregnancy if either partner is taking it.", "hcMetoject"],
    ],
    before: {base: ["cbc", "liver", "renal", "hbv", "hcv", "preg"], extra: [["Albumin and chest X-ray", "ecco"]]},
    monitor: [["CBC, liver tests and creatinine at least monthly for 6 months, then every 3 months.", "ecco"]],
    differ: [["Washout before conception: at least 1 month (global consensus 2025) versus 3 months (CAG 2016).", "gc25 cag16p"]],
  },

  // ---- Calcineurin inhibitor ---------------------------------------------------------------
  {id: "cyclosporine", cls: "cni", n: "Cyclosporine",
    brands: "Sandimmune I.V., Neoral (oral)",
    off: "Off-label for UC in Canada: labelled for transplant, psoriasis, rheumatoid arthritis and nephrotic syndrome.",
    dz: ["uc"], route: ["iv", "oral"], k: "ciclosporin asuc acute severe rescue cni",
    how: ["Calcineurin inhibitor; blocks T-cell activation within days.", "hcNeoral"],
    use: [
      ["Acute severe UC with no response to IV steroids by day 3: rescue therapy, an alternative to infliximab.", "acg25uc aga20"],
      ["A bridge to a slower maintenance drug.", "ecco"],
    ],
    dose: [["IV 2 mg/kg/day, adjusted to a trough of 200 to 400 µg/L; switch to oral once responding, usually within about 4 days.", "ecco"]],
    avoid: [
      ["Abnormal kidney function, uncontrolled hypertension, active cancer or uncontrolled infection (label, for its other uses).", "hcNeoral"],
      ["Bosentan; St. John's wort lowers levels. Many CYP3A4 interactions.", "hcNeoral"],
      ["Low cholesterol or magnesium raise the seizure risk; correct them first.", "ecco"],
    ],
    preg: [],
    before: {base: ["cbc", "liver", "renal", "hbv"], extra: [["Magnesium, potassium, cholesterol and blood pressure", "ecco"]]},
    monitor: [
      ["Trough levels, creatinine, potassium, magnesium, liver tests and blood pressure, closely.", "ecco"],
      ["PJP prophylaxis when given with steroids.", "ecco"],
    ],
  },

  // ---- Anti-TNF ----------------------------------------------------------------------------
  {id: "infliximab", cls: "tnf", n: "Infliximab",
    brands: "Remicade; biosimilars Avsola, Ixifi, Remdantry (formerly Inflectra), Renflexis; Remsima SC",
    dz: ["uc", "cd"], route: ["iv", "sc"], k: "ifx remicade avsola ixifi remdantry inflectra renflexis remsima fistula asuc",
    how: ["Antibody that neutralizes TNF.", "hcRemicade"],
    use: [
      ["Moderate to severe UC or Crohn's, and fistulizing Crohn's.", "hcRemicade"],
      ["A higher-efficacy first advanced therapy in UC and in Crohn's.", "aga24uc aga25cd"],
      ["Perianal fistulas: anti-TNF to induce and maintain, with antibiotics at the start.", "cag18"],
      ["Start it with a thiopurine (or methotrexate).", "aga25cd acg25cd cag18 cag15"],
      ["Acute severe UC: rescue if no response to IV steroids by day 3.", "acg25uc"],
      ["High-risk Crohn's after resection: prevents recurrence.", "acg25cd"],
    ],
    dose: [
      ["5 mg/kg IV at weeks 0, 2 and 6, then every 8 weeks.", "hcRemicade"],
      ["Losing response: up to 10 mg/kg; check the trough and antibodies first.", "hcRemicade aga17"],
      ["Trough target: at least 5 mg/L.", "aga17"],
      ["Fistulas: no response by week 14, stop.", "hcRemicade"],
      ["Remsima SC: 120 mg every 2 weeks, from 4 weeks after IV induction.", "hcRemsimaSC"],
    ],
    warn: ["Serious infections including TB and invasive fungal infections; lymphoma, including hepatosplenic T-cell lymphoma, mostly in young men also on a thiopurine.", "hcRemicade"],
    avoid: [
      ["Serious or active infection: sepsis, abscess, TB, opportunistic infection.", "hcRemicade"],
      ["Moderate to severe heart failure (NYHA III or IV).", "hcRemicade"],
      ["Demyelinating disease (MS, optic neuritis, Guillain-Barré): great caution.", "hcRemicade"],
      ["Past cancer: weigh carefully.", "hcRemicade"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Exposed babies: rotavirus on schedule; BCG after 6 months or once levels are undetectable.", "gc25"],
      ["Label: no live vaccines for 12 months after birth, unless exposure was first-trimester only, the baby's level is undetectable, or benefit is clear.", "hcRemicade"],
    ],
    before: {base: IBD_ADV, extra: []},
    monitor: [
      ["Drug level and antibodies when disease is active.", "aga17"],
      ["Periodic skin checks for everyone (melanoma, Merkel cell); keep up cervical screening.", "hcRemicade acg25p"],
      ["New heart failure or neurologic symptoms: stop.", "hcRemicade"],
    ],
    differ: [
      ["Live vaccines after exposure in the womb: label 12 months; global consensus 2025 gives rotavirus on schedule; CAG 2021 made no recommendation.", "hcRemicade gc25 cag21l"],
      ["Label asks for contraception until 6 months after the last dose; the guidelines continue it through pregnancy.", "hcRemicade gc25"],
      ["Proactive drug levels: AGA makes no recommendation; reactive testing is supported.", "aga17"],
    ],
  },
  {id: "adalimumab", cls: "tnf", n: "Adalimumab",
    brands: "Humira; biosimilars Abrilada, Amgevita, Hadlima, Hulio, Hyrimoz, Idacio, Simlandi, Yuflyma",
    dz: ["uc", "cd"], route: ["sc"], k: "ada humira abrilada amgevita hadlima hulio hyrimoz idacio simlandi yuflyma fistula",
    how: ["Antibody that neutralizes TNF.", "hcHumira"],
    use: [
      ["Moderate to severe UC or Crohn's.", "hcHumira"],
      ["Crohn's: higher efficacy, whether naive to or exposed to advanced therapy.", "aga25cd"],
      ["UC: the lower-efficacy option; ACG prefers vedolizumab over it.", "aga24uc acg25uc"],
      ["Perianal fistulas: anti-TNF to induce and maintain.", "cag18"],
      ["UC: combine with an immunomodulator. Crohn's: no recommendation either way.", "aga24uc aga25cd"],
    ],
    dose: [
      ["160 mg at week 0, 80 mg at week 2, then 40 mg every other week.", "hcHumira"],
      ["Crohn's: dose escalation may be considered for a flare; some week-4 non-responders respond by week 12.", "hcHumira"],
      ["UC: continue only if it worked within the first 8 weeks.", "hcHumira"],
      ["Trough target: at least 7.5 mg/L (weaker evidence than for infliximab).", "aga17"],
    ],
    warn: ["Serious infections including TB; lymphoma and other cancers, including hepatosplenic T-cell lymphoma.", "hcHumira"],
    avoid: [
      ["Serious or active infection, including TB.", "hcHumira"],
      ["Moderate to severe heart failure.", "hcHumira"],
      ["Demyelinating disease: great caution.", "hcHumira"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Label: no live vaccines to the baby for 5 months after the mother's last dose.", "hcHumira"],
    ],
    before: {base: IBD_ADV, extra: [["TB skin test: 5 mm is positive even after BCG", "hcHumira"]]},
    monitor: [
      ["Drug level and antibodies when disease is active.", "aga17"],
      ["Watch for TB during and after treatment; retest if exposure risk continues.", "hcHumira"],
      ["Yearly skin check.", "acg25p"],
    ],
    differ: [["Live vaccines after exposure in the womb: label 5 months; global consensus 2025 gives rotavirus on schedule.", "hcHumira gc25"]],
  },
  {id: "golimumab", cls: "tnf", n: "Golimumab",
    brands: "Simponi (biosimilars Livmoty and Upgolyv approved, not yet sold)",
    dz: ["uc"], route: ["sc"], k: "simponi livmoty upgolyv",
    how: ["Antibody that neutralizes TNF.", "hcSimponi"],
    use: [
      ["Moderate to severe UC; not approved for Crohn's.", "hcSimponi"],
      ["Intermediate efficacy as a first advanced therapy in UC.", "aga24uc"],
      ["Combine with an immunomodulator rather than using it alone.", "aga24uc"],
    ],
    dose: [
      ["200 mg SC at week 0, 100 mg at week 2, then 50 mg every 4 weeks.", "hcSimponi"],
      ["100 mg every 4 weeks at the physician's discretion; check levels before escalating.", "hcSimponi"],
    ],
    warn: ["Serious infections including TB; lymphoma and other cancers.", "hcSimponi"],
    avoid: [
      ["Severe infection: sepsis, TB, opportunistic infection.", "hcSimponi"],
      ["Moderate to severe heart failure (NYHA III or IV).", "hcSimponi"],
    ],
    preg: [["Continue through pregnancy and breastfeeding.", "gc25"]],
    before: {base: IBD_ADV, extra: []},
    monitor: [["Yearly skin check.", "acg25p"]],
  },
  {id: "certolizumab", cls: "tnf", n: "Certolizumab pegol",
    brands: "Cimzia",
    off: "Not approved for IBD in Canada: labelled for rheumatoid arthritis, psoriatic arthritis, axial spondyloarthritis and psoriasis.",
    dz: ["cd"], route: ["sc"], k: "cimzia czp",
    how: ["Pegylated antibody fragment that neutralizes TNF.", "hcCimzia"],
    use: [
      ["Crohn's: AGA suggests it over no treatment, as a lower-efficacy option.", "aga25cd"],
      ["Not recommended in the CAG perianal guideline.", "cag18"],
    ],
    dose: [
      ["No Crohn's dose in the Canadian label.", "hcCimzia"],
      ["Trough target: at least 20 mg/L.", "aga17"],
    ],
    warn: ["Serious infections including TB; lymphoma and other cancers.", "hcCimzia"],
    avoid: [
      ["Moderate to severe heart failure.", "hcCimzia"],
      ["HBsAg-positive: reactivation, sometimes fatal.", "hcCimzia"],
    ],
    preg: [["Continue through pregnancy and breastfeeding.", "gc25"]],
    before: {base: IBD_ADV, extra: []},
    monitor: [["Yearly skin check.", "acg25p"]],
  },

  // ---- Anti-integrin -----------------------------------------------------------------------
  {id: "vedolizumab", cls: "itg", n: "Vedolizumab",
    brands: "Entyvio (IV; SC pen or syringe)",
    dz: ["uc", "cd"], route: ["iv", "sc"], k: "entyvio vdz integrin alpha4beta7 gut selective",
    how: ["Blocks α4β7 integrin so lymphocytes cannot home to the gut; no known systemic immune suppression.", "hcEntyvio"],
    use: [
      ["Moderate to severe UC or Crohn's after conventional therapy or an anti-TNF fails.", "hcEntyvio"],
      ["UC: higher efficacy as a first advanced therapy; lower after other advanced therapies.", "aga24uc"],
      ["Crohn's: higher efficacy if naive, lower if previously exposed.", "aga25cd"],
      ["UC: preferred over adalimumab.", "acg25uc"],
    ],
    dose: [
      ["300 mg IV at weeks 0, 2 and 6, then every 8 weeks.", "hcEntyvio"],
      ["No benefit by week 10 (UC) or week 14 (Crohn's): stop.", "hcEntyvio"],
      ["Losing response: 300 mg IV every 4 weeks.", "hcEntyvio"],
      ["SC: 108 mg every 2 weeks, replacing the next IV dose after at least 2 infusions.", "hcEntyvio"],
    ],
    avoid: [
      ["Active severe or opportunistic infection.", "hcEntyvio"],
      ["Do not combine with an anti-TNF or natalizumab.", "hcEntyvio"],
      ["Jaundice or other significant liver injury: stop.", "hcEntyvio"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Label still asks for contraception until 18 weeks after the last dose.", "hcEntyvio"],
    ],
    before: {base: IBD_ADV, extra: [["TB: the label says to consider screening per local practice", "hcEntyvio"]]},
    monitor: [["Live vaccines only when the benefit outweighs the risk.", "hcEntyvio"]],
    differ: [
      ["Pregnancy: label asks for contraception to 18 weeks; the 2025 global consensus continues it.", "hcEntyvio gc25"],
      ["Hepatitis B: AGA rates integrin and cytokine blockers moderate risk when anti-HBc is positive.", "aga25h"],
    ],
  },

  // ---- IL-12/23 and IL-23 ------------------------------------------------------------------
  {id: "ustekinumab", cls: "il", n: "Ustekinumab",
    brands: "Stelara; biosimilars Finlius, Jamteki, Otulfi, Pyzchiva, Steqeyma, Wezlana, Yesintek (Imuldosa approved)",
    dz: ["uc", "cd"], route: ["iv", "sc"], k: "stelara ust finlius jamteki otulfi pyzchiva steqeyma wezlana yesintek imuldosa p40",
    how: ["Blocks p40, the subunit IL-12 and IL-23 share.", "hcStelara"],
    use: [
      ["Moderate to severe UC or Crohn's.", "hcStelara"],
      ["UC: intermediate efficacy if naive; higher after other advanced therapies.", "aga24uc"],
      ["Crohn's: higher efficacy if naive; intermediate if exposed.", "aga25cd"],
      ["Also approved for psoriasis and psoriatic arthritis.", "hcStelara"],
    ],
    dose: [
      ["One IV dose by weight: 55 kg or less 260 mg; over 55 to 85 kg 390 mg; over 85 kg 520 mg (about 6 mg/kg).", "hcStelara"],
      ["Then 90 mg SC at week 8 and every 8 weeks; every 12 weeks may suit low disease burden.", "hcStelara"],
      ["No benefit 16 weeks after the IV dose: consider stopping.", "hcStelara"],
    ],
    avoid: [
      ["Severe infection: sepsis, active TB, opportunistic infection.", "hcStelara"],
      ["Rare allergic alveolitis or eosinophilic pneumonia.", "hcStelara"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Label: contraception until 15 weeks after the last dose; exposed babies wait 6 months for live vaccines.", "hcStelara"],
    ],
    before: {base: IBD_ADV, extra: [["Treat latent TB before the first dose", "hcStelara"]]},
    monitor: [["Watch for TB during and after treatment.", "hcStelara"]],
    differ: [
      ["Hepatitis B: AGA rates it moderate risk when anti-HBc is positive (prophylaxis suggested); anti-TNF is low risk.", "aga25h"],
      ["After anti-TNF failure in Crohn's, ACG favours risankizumab or upadacitinib over it.", "acg25cd"],
    ],
  },
  {id: "risankizumab", cls: "il", n: "Risankizumab",
    brands: "Skyrizi (IV; SC pen, syringe and on-body injector)",
    dz: ["uc", "cd"], route: ["iv", "sc"], k: "skyrizi rzb p19",
    how: ["Blocks p19, the subunit unique to IL-23.", "hcSkyrizi"],
    use: [
      ["Moderate to severe Crohn's (Canada 2022) and UC (2024).", "hcSkyrizi"],
      ["UC: higher efficacy if naive; intermediate if exposed.", "aga24uc"],
      ["Crohn's: higher efficacy, whether naive or exposed.", "aga25cd"],
      ["Also approved for psoriasis and psoriatic arthritis.", "hcSkyrizi"],
    ],
    dose: [
      ["Crohn's: 600 mg IV at weeks 0, 4 and 8, then 360 mg SC at week 12 and every 8 weeks.", "hcSkyrizi"],
      ["UC: 1200 mg IV at weeks 0, 4 and 8, then 180 or 360 mg SC every 8 weeks from week 12, the lowest that works.", "hcSkyrizi"],
    ],
    avoid: [
      ["Active TB; treat latent TB first.", "hcSkyrizi"],
      ["Live vaccines during treatment; after a live vaccine, wait 4 weeks to start.", "hcSkyrizi"],
      ["Liver enzymes rose during Crohn's induction in trials.", "hcSkyrizi"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Label: contraception until 20 weeks after the last dose.", "hcSkyrizi"],
    ],
    before: {base: IBD_ADV, extra: []},
    monitor: [["Liver enzymes as clinically indicated, especially during induction.", "hcSkyrizi"]],
    differ: [["Hepatitis B: AGA rates cytokine blockers moderate risk when anti-HBc is positive.", "aga25h"]],
  },
  {id: "mirikizumab", cls: "il", n: "Mirikizumab",
    brands: "Omvoh",
    dz: ["uc", "cd"], route: ["iv", "sc"], k: "omvoh p19",
    how: ["Blocks p19, the subunit unique to IL-23.", "hcOmvoh"],
    use: [
      ["Moderate to severe UC; Crohn's added in July 2025.", "hcOmvoh"],
      ["UC: intermediate efficacy, whether naive or exposed.", "aga24uc"],
      ["Crohn's: higher efficacy if naive; intermediate if exposed.", "aga25cd"],
    ],
    dose: [
      ["UC: 300 mg IV at weeks 0, 4 and 8; not enough response at week 12, 3 more IV doses at weeks 12, 16 and 20. Then 200 mg SC every 4 weeks.", "hcOmvoh"],
      ["UC: no benefit after extended induction by week 24, stop.", "hcOmvoh"],
      ["Crohn's: 900 mg IV at weeks 0, 4 and 8, then 300 mg SC every 4 weeks from week 12; no benefit by week 24, consider stopping.", "hcOmvoh"],
    ],
    avoid: [
      ["Clinically important active infection. No data in hepatitis B, hepatitis C or HIV.", "hcOmvoh"],
      ["Live vaccines: avoid; if needed, give at least 4 weeks before starting.", "hcOmvoh"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Label: contraception until 12 weeks after the last dose.", "hcOmvoh"],
    ],
    before: {base: IBD_ADV, extra: []},
    monitor: [["Liver enzymes and bilirubin every 1 to 4 months through induction, including extended induction; stop if drug liver injury is suspected.", "hcOmvoh"]],
    differ: [["Hepatitis B: AGA rates cytokine blockers moderate risk when anti-HBc is positive.", "aga25h"]],
  },
  {id: "guselkumab", cls: "il", n: "Guselkumab",
    brands: "Tremfya (IV; SC pen, syringe and One-Press)",
    dz: ["uc", "cd"], route: ["iv", "sc"], k: "tremfya p19",
    how: ["Blocks p19, the subunit unique to IL-23.", "hcTremfya"],
    use: [
      ["Moderate to severe Crohn's and UC, both approved in Canada in 2025.", "hcTremfya"],
      ["UC: higher efficacy if naive; intermediate if exposed.", "aga24uc"],
      ["Crohn's: higher efficacy, whether naive or exposed.", "aga25cd"],
      ["Also approved for psoriasis and psoriatic arthritis.", "hcTremfya"],
    ],
    dose: [
      ["Induction: 200 mg IV, or 400 mg SC, at weeks 0, 4 and 8.", "hcTremfya"],
      ["Maintenance: 100 mg SC at week 16, then every 8 weeks; or 200 mg SC at week 12, then every 4 weeks, if the response is not enough.", "hcTremfya"],
    ],
    avoid: [
      ["Clinically important active infection, including active TB.", "hcTremfya"],
      ["Acute liver disease or cirrhosis: consider other options.", "hcTremfya"],
      ["Live vaccines: avoid.", "hcTremfya"],
    ],
    preg: [
      ["Continue through pregnancy and breastfeeding.", "gc25"],
      ["Label: contraception until 12 weeks after the last dose.", "hcTremfya"],
    ],
    before: {base: IBD_ADV, extra: []},
    monitor: [["Liver enzymes and bilirubin periodically when clinically indicated.", "hcTremfya"]],
    differ: [["Hepatitis B: AGA rates cytokine blockers moderate risk when anti-HBc is positive.", "aga25h"]],
  },

  // ---- JAK inhibitors ----------------------------------------------------------------------
  {id: "tofacitinib", cls: "jak", n: "Tofacitinib",
    brands: "Xeljanz and generics (Auro, JAMP, pms, Sandoz, Taro)",
    dz: ["uc"], route: ["oral"], k: "xeljanz tofa jak",
    how: ["Oral small molecule that blocks JAK enzymes inside immune cells.", "hcXeljanz"],
    use: [
      ["Moderate to severe UC; not approved for Crohn's.", "hcXeljanz"],
      ["UC: intermediate efficacy if naive; higher after other advanced therapies.", "aga24uc"],
      ["Also approved for rheumatoid arthritis, psoriatic arthritis and ankylosing spondylitis.", "hcXeljanz"],
    ],
    dose: [
      ["10 mg twice daily for at least 8 weeks; no benefit by week 16, stop.", "hcXeljanz"],
      ["Maintenance 5 mg twice daily; 10 mg twice daily for some, at the lowest dose and shortest time that works.", "hcXeljanz"],
      ["Halve the dose for moderate or severe kidney impairment, moderate liver impairment, or ketoconazole or fluconazole.", "hcXeljanz"],
    ],
    warn: ["Serious infections, cancer, blood clots, major cardiac events and death. The cardiac, clot and death signals came from RA patients with cardiac risk factors, most 50 or older.", "hcXeljanz"],
    avoid: [
      ["Pregnancy and breastfeeding: contraindicated in Canada.", "hcXeljanz"],
      ["Severe liver impairment.", "hcXeljanz"],
      ["Raised clot risk: avoid; stop and assess any clot symptoms.", "hcXeljanz"],
      ["Care at 65 or older, in current or past smokers, and with other cardiac or cancer risk factors.", "hcXeljanz"],
      ["Don't start if neutrophils are under 1.0 or lymphocytes under 0.5 ×10⁹/L, or hemoglobin under 90 g/L.", "hcXeljanz"],
      ["Rifampin and other strong inducers.", "hcXeljanz"],
    ],
    preg: [
      ["Avoid unless essential for the mother; stop at least 4 weeks before conception; don't breastfeed.", "gc25"],
      ["Label: contraindicated; contraception until 4 to 6 weeks after the last dose.", "hcXeljanz"],
    ],
    before: {base: IBD_ADV, extra: [
      ["Lipids", "hcXeljanz"],
      ["Cardiac and clot risk review", "hcXeljanz"],
      ["Shingrix first if possible: zoster is more common on JAKs", "hcXeljanz naciz"],
    ]},
    monitor: [
      ["Lymphocytes, neutrophils and hemoglobin at 4 to 8 weeks, then every 3 months.", "hcXeljanz"],
      ["Lipids at 4 to 8 weeks, then every 6 months.", "hcXeljanz"],
      ["Liver tests in routine care; pause if drug liver injury is suspected.", "hcXeljanz"],
      ["Lymphocytes confirmed under 0.5 ×10⁹/L: stop.", "hcXeljanz"],
      ["Test for TB during therapy as well.", "hcXeljanz"],
      ["Yearly skin check for non-melanoma skin cancer.", "acg25p"],
    ],
    differ: [["Pregnancy: the label contraindicates it; the 2025 global consensus says avoid unless essential for the mother.", "hcXeljanz gc25"]],
  },
  {id: "upadacitinib", cls: "jak", n: "Upadacitinib",
    brands: "Rinvoq",
    dz: ["uc", "cd"], route: ["oral"], k: "rinvoq upa jak",
    how: ["Oral small molecule that blocks JAK1 inside immune cells.", "hcRinvoq"],
    use: [
      ["Moderate to severe UC and Crohn's.", "hcRinvoq"],
      ["UC: higher efficacy, whether naive or exposed.", "aga24uc"],
      ["Crohn's: higher efficacy after other advanced therapies; lower as a first one (US rules limit JAKs to after anti-TNF).", "aga25cd"],
      ["Also approved for rheumatoid arthritis, psoriatic arthritis, axial spondyloarthritis, giant cell arteritis and atopic dermatitis.", "hcRinvoq"],
    ],
    dose: [
      ["UC: 45 mg daily for 8 weeks, then 15 mg; 30 mg for refractory, severe or extensive disease.", "hcRinvoq"],
      ["Crohn's: 45 mg daily for 12 weeks, then 15 or 30 mg.", "hcRinvoq"],
      ["65 or older: 15 mg maintenance only.", "hcRinvoq"],
      ["Severe kidney impairment or strong CYP3A4 inhibitors: 30 mg to induce, 15 mg to maintain.", "hcRinvoq"],
      ["Response not kept on 30 mg: stop.", "hcRinvoq"],
    ],
    warn: ["Serious infections, cancer, blood clots, major cardiac events and death, as for the JAK class.", "hcRinvoq"],
    avoid: [
      ["Severe liver impairment (Child-Pugh C).", "hcRinvoq"],
      ["With other potent immunosuppressants, biologics or JAK inhibitors.", "hcRinvoq"],
      ["Don't start if lymphocytes are under 0.5 or neutrophils under 1.0 ×10⁹/L, or hemoglobin under 80 g/L.", "hcRinvoq"],
      ["Bowel perforation risk with diverticular disease, NSAIDs, steroids or opioids.", "hcRinvoq"],
      ["Strong CYP3A4 inducers.", "hcRinvoq"],
      ["Tablet shells can show up in stool or stoma output, mainly with short transit.", "hcRinvoq"],
    ],
    preg: [
      ["Avoid unless essential for the mother; stop at least 4 weeks before conception; don't breastfeed.", "gc25"],
      ["Label: not in pregnancy; contraception until 4 weeks after the last dose.", "hcRinvoq"],
    ],
    before: {base: IBD_ADV, extra: [
      ["Lipids", "hcRinvoq"],
      ["Cardiac and clot risk review", "hcRinvoq"],
      ["Shingrix first if possible: zoster is more common on JAKs", "hcRinvoq naciz"],
    ]},
    monitor: [
      ["Neutrophils, lymphocytes and hemoglobin by week 12, then as needed for the patient.", "hcRinvoq"],
      ["Lipids at 12 weeks, then per lipid guidelines.", "hcRinvoq"],
      ["Liver tests in routine care.", "hcRinvoq"],
      ["Test for TB during therapy as well.", "hcRinvoq"],
      ["Yearly skin check for non-melanoma skin cancer.", "acg25p"],
    ],
    differ: [["Crohn's: AGA calls it lower efficacy as a first advanced therapy, while ACG recommends it after anti-TNF failure.", "aga25cd acg25cd"]],
  },

  // ---- S1P modulators ----------------------------------------------------------------------
  {id: "ozanimod", cls: "s1p", n: "Ozanimod",
    brands: "Zeposia",
    dz: ["uc"], route: ["oral"], k: "zeposia s1p sphingosine",
    how: ["S1P receptor modulator; holds lymphocytes in the lymph nodes.", "hcZeposia"],
    use: [
      ["Moderate to severe UC; not approved for Crohn's.", "hcZeposia"],
      ["UC: higher efficacy if naive; lower after other advanced therapies.", "aga24uc"],
      ["Also approved for relapsing multiple sclerosis.", "hcZeposia"],
    ],
    dose: [
      ["7-day starter pack: 0.23 mg on days 1 to 4, 0.46 mg on days 5 to 7, then 0.92 mg daily.", "hcZeposia"],
      ["Mild or moderate liver impairment: 0.92 mg every other day after the titration.", "hcZeposia"],
      ["Restart the titration after a gap of more than 7 days (days 15 to 28) or more than 14 days (after day 28).", "hcZeposia"],
    ],
    avoid: [
      ["In the last 6 months: heart attack, unstable angina, stroke, TIA, or heart failure needing admission; any NYHA III or IV.", "hcZeposia"],
      ["Mobitz II or third-degree AV block, sick sinus or SA block, unless paced.", "hcZeposia"],
      ["Immunocompromised, including from other immune-suppressing treatment.", "hcZeposia"],
      ["MAO inhibitors; wait 3 months after stopping before starting one.", "hcZeposia"],
      ["Severe untreated sleep apnea, or QTc over 450 ms (men) or 470 ms (women): ask cardiology first.", "hcZeposia"],
      ["Severe liver impairment: not recommended.", "hcZeposia"],
      ["Pregnancy, or able to become pregnant without effective contraception.", "hcZeposia"],
    ],
    preg: [
      ["Avoid unless essential for the mother; stop at least 3 months before conception; don't breastfeed.", "gc25"],
      ["Label: contraception until 3 months after stopping.", "hcZeposia"],
    ],
    before: {base: IBD_ADV, extra: [
      ["ECG for everyone", "hcZeposia"],
      ["CBC with lymphocyte count and liver tests from the last 6 months", "hcZeposia"],
      ["VZV antibodies if no confirmed chickenpox or vaccine; vaccinate and start 1 month later", "hcZeposia"],
      ["Eye exam first if diabetes, uveitis or retinal disease", "hcZeposia"],
      ["Negative pregnancy test", "hcZeposia"],
      ["Skin check; consider HPV vaccine; review heart-rate-lowering drugs", "hcZeposia"],
      ["First dose with 6 hours of monitoring if heart rate under 55, first-degree or Mobitz I block, or past heart attack or heart failure", "hcZeposia"],
    ]},
    monitor: [
      ["CBC periodically; lymphocytes confirmed under 0.2 ×10⁹/L: hold until above 0.5.", "hcZeposia"],
      ["Blood pressure.", "hcZeposia"],
      ["Eye exam during treatment if at risk; any change in vision: look for macular edema.", "hcZeposia"],
      ["Yearly skin check.", "hcZeposia acg25p"],
      ["After stopping, lymphocytes recover in about a month (most within 3).", "hcZeposia"],
    ],
  },
  {id: "etrasimod", cls: "s1p", n: "Etrasimod",
    brands: "Velsipity",
    dz: ["uc"], route: ["oral"], k: "velsipity s1p sphingosine",
    how: ["S1P receptor modulator; holds lymphocytes in the lymph nodes.", "hcVelsipity"],
    use: [
      ["Moderate to severe UC (Canada 2024); not approved for Crohn's.", "hcVelsipity"],
      ["UC: higher efficacy if naive; lower after other advanced therapies.", "aga24uc"],
    ],
    dose: [["2 mg once daily, with no titration.", "hcVelsipity"]],
    avoid: [
      ["In the last 6 months: heart attack, unstable angina, stroke, TIA, or heart failure needing admission; any NYHA III or IV.", "hcVelsipity"],
      ["Mobitz II or third-degree AV block, sick sinus or SA block, unless paced.", "hcVelsipity"],
      ["Immunocompromised; severe active or chronic infection; active cancer.", "hcVelsipity"],
      ["Pregnancy without effective contraception, and breastfeeding.", "hcVelsipity"],
      ["Fluconazole, or other drugs that block two of CYP2C8, 2C9 and 3A4; rifampin.", "hcVelsipity"],
    ],
    preg: [
      ["Avoid unless essential for the mother; stop 1 to 2 weeks before conception; don't breastfeed.", "gc25"],
      ["Label: contraception until 7 days after stopping.", "hcVelsipity"],
    ],
    before: {base: IBD_ADV, extra: [
      ["ECG", "hcVelsipity"],
      ["CBC with lymphocyte count and liver tests from the last 6 months", "hcVelsipity"],
      ["Fundus exam including the macula, for everyone", "hcVelsipity"],
      ["Live vaccines at least 4 weeks before starting", "hcVelsipity"],
      ["Review heart-rate-lowering drugs; spirometry if severe lung disease", "hcVelsipity"],
      ["First dose with 4 hours of monitoring if heart rate under 50, first-degree or Mobitz I block, or past heart attack or heart failure", "hcVelsipity"],
    ]},
    monitor: [
      ["Blood pressure.", "hcVelsipity"],
      ["No live vaccines during treatment or for 2 weeks after.", "hcVelsipity"],
      ["Yearly skin check.", "acg25p"],
    ],
  },
];

// Before any advanced therapy: the shared card.
const IBD_PREP = {
  positive: [
    ["Positive TB test: rule out active TB, then treat TB infection. A common rule is to start the biologic after at least 1 month of treatment.", "cts acr15"],
    ["HBsAg positive: entecavir or tenofovir before starting, continued at least 6 months after stopping; involve hepatology.", "casl aga25h"],
    ["Anti-HBc positive alone: check HBV DNA. Anti-TNF, thiopurine, methotrexate: low risk, monitor. Ustekinumab, IL-23, vedolizumab, JAK, or prednisone 10 mg or more for 4 weeks: moderate risk, prophylaxis suggested.", "aga25h"],
    ["Monitoring instead of prophylaxis: ALT and HBV DNA every 1 to 3 months.", "aga25h"],
    ["Not immune to varicella: 2 doses of the live vaccine, then start at least 4 weeks later.", "cag21l hcZeposia"],
    ["Not immune to hepatitis B: vaccinate, then check anti-HBs (over 10 IU/L is a response).", "cag21i"],
  ],
  vaccines: [
    ["Shingrix: 2 doses for every adult 18 or over who is or will be immunocompromised, ideally finished 14 days before starting.", "naciz"],
    ["Shingrix doses go 2 to 6 months apart, or 4 weeks apart if therapy is about to start.", "naciz"],
    ["Pneumococcal: one dose of Pneu-C-20 or Pneu-C-21, whatever came before. After Pneu-P-23, wait 8 weeks if therapy starts soon.", "nacip"],
    ["Influenza every year, inactivated only; no nasal spray on therapy.", "cag21i acg25p"],
    ["COVID-19 as NACI currently advises.", "acg25p"],
    ["Hepatitis B if not immune.", "cag21i"],
    ["HPV: 9 to 26 (strong for females, suggested for males); 27 to 45 case by case.", "cag21i"],
    ["Tdap once as an adult, then tetanus-diphtheria every 10 years.", "cag21i"],
    ["RSV: 75 or older, or 65 to 74 at higher risk; other adults at risk may choose it.", "nacir"],
    ["Live vaccines (MMR, varicella, yellow fever): at least 4 weeks before starting; not during, or for 3 months after stopping.", "cag21l"],
    ["Never delay urgent therapy to give vaccines.", "cag21l"],
  ],
  ongoing: [
    ["TB test again each year while exposure risk continues (travel, work, household contact).", "acr15"],
    ["Skin check every year: melanoma for everyone with IBD; non-melanoma skin cancer too on a thiopurine, methotrexate, JAK inhibitor or S1P modulator.", "acg25p"],
    ["Screen for depression and anxiety every year.", "acg25p"],
    ["Bone density if there are risk factors for osteoporosis, steroids among them.", "acg25p"],
  ],
  hospital: [
    ["Send TB and hepatitis B tests on admission so rescue therapy is not held up.", "prac"],
    ["Flexible sigmoidoscopy within 72 hours, ideally 24.", "acg25uc"],
    ["No response to IV steroids by day 3: infliximab or cyclosporine.", "acg25uc"],
  ],
  babies: [
    ["Inactivated vaccines on schedule.", "gc25"],
    ["Rotavirus on schedule, even after biologics in pregnancy.", "gc25 acg25p"],
    ["BCG: wait until 6 months of age or until the baby's drug level is undetectable.", "gc25"],
    ["After a thiopurine, JAK or S1P in pregnancy: other live vaccines from 1 month of age.", "gc25"],
    ["Labels are stricter: infliximab 12 months, ustekinumab 6 months, adalimumab 5 months after the mother's last dose.", "hcRemicade hcStelara hcHumira"],
  ],
  differ: [
    ["Shingrix under 50: NACI 2025 strongly recommends it for anyone immunocompromised; CAG 2021 only suggested it.", "naciz cag21i"],
    ["Live vaccines for exposed babies: global consensus 2025 gives rotavirus on schedule; CAG 2021 made no recommendation; the infliximab label says wait 12 months.", "gc25 cag21l hcRemicade"],
  ],
};

// Patient situations: a lens on the list. r: drug id -> [verdict, reason, sources];
// verdicts are "ok", "care" and "avoid". Drugs not named are "not addressed".
const IBD_SITS = [
  {id: "preg", n: "Pregnancy", src: "gc25",
    sum: "Keep the mother in remission: most drugs continue. Stop methotrexate, JAK inhibitors and S1P modulators before conception. Follow every IBD pregnancy as high risk; low-dose aspirin is suggested by 12 to 16 weeks.",
    r: {
      mesalamine: ["ok", "Continue through pregnancy.", "gc25"],
      sulfasalazine: ["ok", "Continue, with a folate supplement.", "gc25 hcSalaz"],
      budesonide: ["care", "When needed.", "gc25"],
      steroids: ["care", "When needed.", "gc25"],
      thiopurines: ["ok", "Continue; watch liver tests for cholestasis.", "gc25"],
      mtx: ["avoid", "Contraindicated; stop 1 to 3 months before conception.", "gc25 hcMetoject"],
      infliximab: ["ok", "Continue through pregnancy.", "gc25"],
      adalimumab: ["ok", "Continue through pregnancy.", "gc25"],
      golimumab: ["ok", "Continue through pregnancy.", "gc25"],
      certolizumab: ["ok", "Continue through pregnancy.", "gc25"],
      vedolizumab: ["ok", "Continue through pregnancy.", "gc25"],
      ustekinumab: ["ok", "Continue through pregnancy.", "gc25"],
      risankizumab: ["ok", "Continue through pregnancy.", "gc25"],
      mirikizumab: ["ok", "Continue through pregnancy.", "gc25"],
      guselkumab: ["ok", "Continue through pregnancy.", "gc25"],
      tofacitinib: ["avoid", "Avoid unless essential; stop 4 weeks before conception.", "gc25 hcXeljanz"],
      upadacitinib: ["avoid", "Avoid unless essential; stop 4 weeks before conception.", "gc25 hcRinvoq"],
      ozanimod: ["avoid", "Avoid unless essential; stop 3 months before conception.", "gc25 hcZeposia"],
      etrasimod: ["avoid", "Avoid unless essential; stop 1 to 2 weeks before conception.", "gc25 hcVelsipity"],
    }},
  {id: "bf", n: "Breastfeeding", src: "gc25",
    sum: "Most IBD drugs are compatible with breastfeeding. JAK inhibitors, S1P modulators and methotrexate are not.",
    r: {
      mesalamine: ["ok", "Compatible.", "gc25"],
      sulfasalazine: ["ok", "Compatible; care with a premature or G6PD-deficient baby.", "gc25 hcSalaz"],
      budesonide: ["ok", "Compatible.", "gc25"],
      steroids: ["ok", "Compatible.", "gc25"],
      thiopurines: ["ok", "Compatible.", "gc25"],
      mtx: ["avoid", "Contraindicated in the label.", "hcMetoject"],
      infliximab: ["ok", "Compatible.", "gc25"],
      adalimumab: ["ok", "Compatible.", "gc25"],
      golimumab: ["ok", "Compatible.", "gc25"],
      certolizumab: ["ok", "Compatible.", "gc25"],
      vedolizumab: ["ok", "Compatible.", "gc25"],
      ustekinumab: ["ok", "Compatible.", "gc25"],
      risankizumab: ["ok", "Compatible.", "gc25"],
      mirikizumab: ["ok", "Compatible.", "gc25"],
      guselkumab: ["ok", "Compatible.", "gc25"],
      tofacitinib: ["avoid", "Do not breastfeed.", "gc25 hcXeljanz"],
      upadacitinib: ["avoid", "Do not breastfeed.", "gc25 hcRinvoq"],
      ozanimod: ["avoid", "Do not breastfeed.", "gc25"],
      etrasimod: ["avoid", "Do not breastfeed.", "gc25 hcVelsipity"],
    }},
  {id: "old", n: "65 and over", src: "aga20old",
    sum: "Infection and cancer risks rise with age. The labels add specific cautions for JAK and S1P drugs.",
    r: {
      thiopurines: ["care", "Lymphoma risk rises with age.", "aga20old"],
      infliximab: ["care", "Higher infection risk with anti-TNF.", "aga20old"],
      adalimumab: ["care", "Higher infection risk with anti-TNF.", "aga20old"],
      golimumab: ["care", "Higher infection risk with anti-TNF.", "aga20old"],
      certolizumab: ["care", "Higher infection risk with anti-TNF.", "aga20old"],
      vedolizumab: ["care", "Few trial patients over 65; interpret with care.", "hcEntyvio"],
      tofacitinib: ["care", "More infections, cardiac events and cancer at 65 or older.", "hcXeljanz"],
      upadacitinib: ["care", "15 mg is the only maintenance dose at 65 or older.", "hcRinvoq"],
      ozanimod: ["care", "Use with care at 65 or older.", "hcZeposia"],
    }},
  {id: "hf", n: "Heart failure", src: "hcRemicade",
    sum: "Anti-TNF drugs are contraindicated in moderate to severe heart failure; S1P modulators after recent decompensation.",
    r: {
      infliximab: ["avoid", "Contraindicated in NYHA III or IV.", "hcRemicade"],
      adalimumab: ["avoid", "Contraindicated in moderate to severe heart failure.", "hcHumira"],
      golimumab: ["avoid", "Contraindicated in NYHA III or IV.", "hcSimponi"],
      certolizumab: ["avoid", "Contraindicated in moderate to severe heart failure.", "hcCimzia"],
      ozanimod: ["avoid", "Contraindicated in NYHA III or IV, or after admission for heart failure in the last 6 months.", "hcZeposia"],
      etrasimod: ["avoid", "Contraindicated in NYHA III or IV, or after admission for heart failure in the last 6 months.", "hcVelsipity"],
      tofacitinib: ["care", "Slows the heart and lengthens PR; care with heart failure.", "hcXeljanz"],
    }},
  {id: "ms", n: "MS or optic neuritis", src: "hcRemicade",
    sum: "Anti-TNF drugs can trigger or worsen demyelination.",
    r: {
      infliximab: ["avoid", "Demyelinating disease: great caution.", "hcRemicade"],
      adalimumab: ["avoid", "Demyelinating disease: great caution.", "hcHumira"],
      ozanimod: ["ok", "Also approved for relapsing MS.", "hcZeposia"],
    }},
  {id: "fist", n: "Perianal fistula", src: "cag18",
    sum: "Anti-TNF is the medical treatment with the best evidence, ideally with a thiopurine or methotrexate, plus antibiotics and a surgeon's view.",
    r: {
      infliximab: ["ok", "Labelled for fistulizing Crohn's; anti-TNF recommended.", "hcRemicade cag18"],
      adalimumab: ["ok", "Anti-TNF recommended.", "cag18"],
      thiopurines: ["ok", "As a partner to anti-TNF.", "cag18"],
      mtx: ["ok", "As a partner to anti-TNF.", "cag18"],
      ustekinumab: ["care", "Needs more evidence.", "cag18"],
      vedolizumab: ["care", "Needs more evidence.", "cag18"],
      certolizumab: ["avoid", "Not recommended.", "cag18"],
    }},
  {id: "joint", n: "Arthritis or spondylitis", src: "hcRinvoq",
    sum: "Several IBD drugs are also approved in Canada for inflammatory arthritis. Vedolizumab acts only in the gut.",
    r: {
      infliximab: ["ok", "Also approved for RA, psoriatic arthritis and ankylosing spondylitis.", "hcRemicade"],
      adalimumab: ["ok", "Also approved for RA, psoriatic arthritis and ankylosing spondylitis.", "hcHumira"],
      golimumab: ["ok", "Also approved for RA, psoriatic arthritis and axial spondyloarthritis.", "hcSimponi"],
      certolizumab: ["ok", "Approved for RA, psoriatic arthritis and axial spondyloarthritis.", "hcCimzia"],
      upadacitinib: ["ok", "Also approved for RA, psoriatic arthritis and axial spondyloarthritis.", "hcRinvoq"],
      tofacitinib: ["ok", "Also approved for RA, psoriatic arthritis and ankylosing spondylitis.", "hcXeljanz"],
      ustekinumab: ["ok", "Also approved for psoriatic arthritis (not axial disease).", "hcStelara"],
      risankizumab: ["ok", "Also approved for psoriatic arthritis.", "hcSkyrizi"],
      guselkumab: ["ok", "Also approved for psoriatic arthritis.", "hcTremfya"],
      sulfasalazine: ["ok", "EN-tabs are approved for RA; prominent arthritis favours it in mild UC.", "hcSalaz aga19"],
      vedolizumab: ["care", "Gut-selective: no effect expected on joints.", "hcEntyvio"],
    }},
  {id: "pso", n: "Psoriasis", src: "hcStelara",
    sum: "IL-12/23 and IL-23 drugs treat both. Anti-TNF drugs can also set off new psoriasis.",
    r: {
      ustekinumab: ["ok", "Also approved for psoriasis.", "hcStelara"],
      risankizumab: ["ok", "Also approved for psoriasis.", "hcSkyrizi"],
      guselkumab: ["ok", "Also approved for psoriasis.", "hcTremfya"],
      infliximab: ["care", "Approved for psoriasis, but can also cause new psoriasis.", "hcRemicade"],
      adalimumab: ["care", "Approved for psoriasis; anti-TNF can also cause new psoriasis.", "hcHumira hcRemicade"],
      certolizumab: ["ok", "Approved for psoriasis.", "hcCimzia"],
    }},
  {id: "oral", n: "Pills only", src: "prac",
    sum: "Every oral option, for someone who won't do injections or infusions.",
    r: {
      mesalamine: ["ok", "Oral, with rectal forms.", "hcMezavant"],
      sulfasalazine: ["ok", "Oral.", "hcSalaz"],
      budesonide: ["ok", "Oral, for induction.", "hcEntocort"],
      steroids: ["ok", "Oral prednisone, for induction.", "cag15"],
      thiopurines: ["ok", "Oral.", "hcImuran"],
      mtx: ["care", "Tablets exist, but oral methotrexate is not recommended for Crohn's.", "aga25cd"],
      cyclosporine: ["care", "Oral after IV rescue, short term.", "ecco"],
      tofacitinib: ["ok", "Oral, UC only.", "hcXeljanz"],
      upadacitinib: ["ok", "Oral, UC and Crohn's.", "hcRinvoq"],
      ozanimod: ["ok", "Oral, UC only.", "hcZeposia"],
      etrasimod: ["ok", "Oral, UC only.", "hcVelsipity"],
    }},
];

// Not in Canada yet (checked against the Drug Product Database).
const IBD_SOON = [
  ["Filgotinib (Jyseleca)", "JAK1 inhibitor approved for UC in Europe; not approved in Canada and not in the Drug Product Database."],
  ["Obefazimod", "Oral small molecule for UC; positive phase 3 trials; US filing planned for late 2026."],
  ["Tulisokibart", "Anti-TL1A antibody; positive phase 3 induction trial in UC in June 2026."],
  ["Icotrokinra", "Oral IL-23 receptor-blocking peptide; UC phase 3 under way."],
];

// ---- Helpers -------------------------------------------------------------------------------
const IBD_BY_ID = Object.fromEntries(IBD_DRUGS.map(d => [d.id, d]));
const IBD_CLASS_BY_ID = Object.fromEntries(IBD_CLASSES.map(c => [c.id, c]));

function ibdNorm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
// Source keys on a line, in order.
function ibdKeys(line) { return String(line && line[1] || "").split(/\s+/).filter(Boolean); }
// Every source a drug's card cites, in the order they first appear.
function ibdRefs(d) {
  const out = [];
  const add = line => { for (const k of ibdKeys(line)) if (!out.includes(k)) out.push(k); };
  [d.how].concat(d.use, d.dose, d.warn ? [d.warn] : [], d.avoid, d.preg, d.monitor, d.differ || []).forEach(add);
  for (const id of d.before.base) add(IBD_BASE[id]);
  d.before.extra.forEach(add);
  return out;
}
// The full work-up for a drug: shared items first, then its own.
function ibdWorkup(d) {
  return d.before.base.map(id => ({id, line: IBD_BASE[id], own: false}))
    .concat(d.before.extra.map((line, i) => ({id: d.id + "-" + i, line, own: true})));
}
// Plain text for a clinic note, one line per test.
function ibdWorkupText(d) {
  const items = (d ? ibdWorkup(d) : IBD_ADV.map(id => ({id, line: IBD_BASE[id], own: false})))
    .map(x => x.own ? x.line[0] : IBD_ORDER[x.id]);
  return (d ? "Before " + d.n.charAt(0).toLowerCase() + d.n.slice(1) : "Before advanced therapy") + ":\n" + items.map(s => "- " + s).join("\n");
}

// What a drug is found by: names first, then brands and class, then the card.
function ibdHay(d) {
  const lines = [d.how].concat(d.use, d.dose, d.avoid, d.preg, d.monitor, d.differ || [], d.before.extra);
  return {
    name: " " + ibdNorm(d.n) + " ",
    k: " " + ibdNorm(d.brands + " " + d.k + " " + IBD_CLASS_BY_ID[d.cls].n) + " ",
    body: " " + ibdNorm(lines.map(l => l[0]).join(" ") + " " + (d.warn ? d.warn[0] : "")) + " ",
  };
}
const IBD_HAY = Object.fromEntries(IBD_DRUGS.map(d => [d.id, ibdHay(d)]));
// Every word must match; matches in names and brands count most.
function ibdSearch(drugs, q) {
  const words = ibdNorm(q).split(" ").filter(Boolean);
  if (!words.length) return drugs.slice();
  const scored = [];
  drugs.forEach((d, i) => {
    const h = IBD_HAY[d.id];
    let score = 0;
    for (const w of words) {
      const at = (hay, weight) => hay.includes(" " + w) ? weight * 2 : hay.includes(w) ? weight : 0;
      const s = Math.max(at(h.name, 6), at(h.k, 4), at(h.body, 1));
      if (!s) return;
      score += s;
    }
    scored.push({d, score, i});
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.d);
}
// The list for a chip: "all", "uc", "cd", or a class id.
function ibdFilter(drugs, chip) {
  if (!chip || chip === "all") return drugs.slice();
  if (chip === "uc" || chip === "cd") return drugs.filter(d => d.dz.includes(chip));
  return drugs.filter(d => d.cls === chip);
}
// A situation's verdicts, grouped: fits, care, avoid, then not addressed.
function ibdSituation(id, drugs) {
  const s = IBD_SITS.find(x => x.id === id);
  if (!s) return null;
  const groups = {ok: [], care: [], avoid: [], none: []};
  for (const d of drugs) {
    const r = s.r[d.id];
    if (r) groups[r[0]].push({d, why: r[1], src: r[2]});
    else groups.none.push({d});
  }
  return {s, groups};
}
