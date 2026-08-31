# KynthAI global provider and laboratory eligibility matrix

Status: operational launch-gate register, reviewed 31 August 2026

This is a conservative screening register, not legal advice, a licence, accreditation, regulatory approval, or a promise that KynthAI is available in a market. It assumes KynthAI coordinates independently licensed doctors, clinics, and laboratories. If KynthAI diagnoses, interprets results, triages, orders tests, prescribes, or qualifies as medical-device/AI software, a separate product-scope review is required.

## Status meanings

- `eligible-after-manual-review`: a credible credential and laboratory evidence route was identified, but no individual provider or service may be activated automatically.
- `restricted/manual-only`: do not launch a market-wide workflow; review each provider, facility, service, and data flow manually and expect additional local restrictions.
- `not-reviewed`: no recommendation is made. This is not a finding of ineligibility.

A market status never approves an individual provider. Every application remains `pending` and `verified: false` until the owner records the exact jurisdiction, evidence, reviewer, decision date, scope, and next review date.

## Matrix

| Market | Doctor / professional evidence route | Laboratory evidence route | Launch gate |
|---|---|---|---|
| United States — national screen | Patient-location state medical board, state registration/exception, compact or temporary authority. HHS explains that telehealth licensure is state-based; an NPI is not proof of licensure. | Current CLIA certificate or applicable state-equivalent authorization, facility location, test complexity and scope; use CMS QCOR/CLIA evidence. | `restricted/manual-only` |
| Canada — national screen | One of 13 provincial/territorial medical regulators; the relevant patient and provider jurisdictions set the practice rules. | Provincial/territorial facility licence plus recognised accreditation and exact scope; Ontario, British Columbia and Alberta routes were verified in this pass. | `restricted/manual-only` |
| Canada — Ontario | CPSO virtual-care/licensing review and Ontario registration route. | Ontario laboratory licence and licensed-test scope; Accreditation Canada Diagnostics evidence where applicable. | `eligible-after-manual-review` for an individually reviewed provider/facility |
| Canada — British Columbia | CPSBC registration/licence and virtual-care scope. | CPSBC Diagnostic Accreditation Program award and scope. | `eligible-after-manual-review` for an individually reviewed provider/facility |
| Canada — Alberta | Alberta professional and facility-approval route. | CPSA Diagnostic Laboratory Medicine accreditation and scope. | `eligible-after-manual-review` for an individually reviewed provider/facility |
| Austria | Austrian Medical Chamber / regional chamber register. | Akkreditierung Austria / recognised medical-testing scope. | `eligible-after-manual-review` |
| Belgium | FPS Public Health / competent authority identified through the EU Regulated Professions Database. | BELAC / recognised medical-testing scope. | `eligible-after-manual-review` |
| Bulgaria | Bulgarian Medical Association / competent authority. | Bulgarian Accreditation Service (BAS). | `eligible-after-manual-review` |
| Croatia | Croatian Medical Chamber / Ministry of Health route. | Croatian Accreditation Agency (HAA). | `eligible-after-manual-review` |
| Cyprus | Cyprus Medical Council register. | CYS-CYSAB. | `eligible-after-manual-review` |
| Czechia | Czech Medical Chamber / Ministry of Health route. | Czech Accreditation Institute (CAI). | `eligible-after-manual-review` |
| Denmark | Danish Patient Safety Authority Authorization Register. | DANAK. | `eligible-after-manual-review` |
| Estonia | Health Board / national healthcare-professional register. | Estonian Accreditation Centre (EAK). | `eligible-after-manual-review` |
| Finland | Valvira professional-practice register. | Finnish Accreditation Service (FINAS). | `eligible-after-manual-review` |
| France | RPPS / Annuaire Santé. | COFRAC. | `eligible-after-manual-review` |
| Germany | Relevant state Ärztekammer; Bundesärztekammer is the umbrella body. | DAkkS. | `eligible-after-manual-review` |
| Greece | Panhellenic Medical Association / local medical association route. | Hellenic Accreditation System (ESYD). | `eligible-after-manual-review` |
| Hungary | National Directorate General for Hospitals (ENK) basic register. | National Accreditation Authority (NAH). | `eligible-after-manual-review` |
| Iceland | Directorate of Health licensed-healthcare-practitioner register. | ISAC medical-testing scope, including ISO 15189 evidence where applicable. | `eligible-after-manual-review` |
| Ireland | Medical Council register. | INAB. | `eligible-after-manual-review` |
| Italy | FNOMCeO national/provincial medical orders. | Accredia. | `eligible-after-manual-review` |
| Latvia | Health Inspectorate register. | LATAK. | `eligible-after-manual-review` |
| Liechtenstein | Office of Public Health / health-professions route. | No Liechtenstein medical-testing scope was confirmed in the reviewed EA directory; resolve the recognised Swiss/other route manually. | `restricted/manual-only` |
| Lithuania | Ministry of Health / competent-authority route. | Lithuanian Accreditation and Standardization Agency (LA). | `eligible-after-manual-review` |
| Luxembourg | Ministry of Health and Social Security register / Medical Board. | OLAS. | `eligible-after-manual-review` |
| Malta | Medical Council Malta register. | NAB-Malta was identified, but ISO 15189 medical-testing scope was not verified in this pass. | `restricted/manual-only` |
| Netherlands | BIG register. | Raad voor Accreditatie (RvA). | `eligible-after-manual-review` |
| Norway | Directorate of Health / Health Personnel Registry. | Norsk akkreditering. | `eligible-after-manual-review` |
| Poland | National Chamber of Physicians / competent-authority route. | Polish Centre for Accreditation (PCA). | `eligible-after-manual-review` |
| Portugal | Ordem dos Médicos / competent-authority route. | IPAC. | `eligible-after-manual-review` |
| Romania | College of Physicians of Romania / competent-authority route. | RENAR. | `eligible-after-manual-review` |
| Slovakia | Slovak Medical Chamber / competent-authority route. | SNAS. | `eligible-after-manual-review` |
| Slovenia | Medical Chamber of Slovenia / competent-authority route. | Slovenian Accreditation (SA). | `eligible-after-manual-review` |
| Spain | CGCOM plus provincial/regional medical colleges. | ENAC. | `eligible-after-manual-review` |
| Sweden | Socialstyrelsen licence register. | SWEDAC. | `eligible-after-manual-review` |
| United Kingdom — domestic | GMC medical register and licence to practise. | UKAS and exact medical-laboratory scope. | `eligible-after-manual-review` |
| United Kingdom → EU/EEA | Do not assume EU qualification recognition or destination-country telehealth authority for a UK-established provider. | UKAS plus every destination-country requirement. | `restricted/manual-only` |
| Australia | Ahpra register, current registration/conditions, professional indemnity and telehealth workflow; state/territory National Law and health-privacy overlays still apply. | NATA medical-laboratory accreditation and exact scope; APL/APA evidence where Medicare pathology claims are involved. | `eligible-after-manual-review` |
| New Zealand | MCNZ register plus current practising certificate and telehealth scope. | IANZ medical-laboratory accreditation and exact scope. | `eligible-after-manual-review` |
| India | NMC/State Medical Council evidence and India-focused Telemedicine Practice Guidelines; an AI platform may assist an RMP but may not counsel or prescribe. | NABL medical-laboratory accreditation and exact scope plus the applicable central/state/UT facility regime. | `restricted/manual-only` |
| Singapore | SMC registration and practising certificate; HCSA service-mode and facility licensing, including a Singapore-resident clinical governance officer where required. | HCSA Clinical Laboratory Service licence; SAC/ISO 15189 is quality evidence, not a licence substitute. | `eligible-after-manual-review` |
| United Arab Emirates | Exact emirate authority (DHA, DoH, MOHAP, SHA or applicable free-zone authority), professional licence, PSV, good standing, facility affiliation and telehealth approval. | Emirate facility/laboratory licence and required accreditation/scope. | `restricted/manual-only` |
| Any other country or unlisted service variant | No evidence-based recommendation until the regulator, service location, patient location and cross-border route are reviewed. | No evidence-based recommendation. | `not-reviewed` |

EU/EEA rows use the European Commission Regulated Professions Database and European Accreditation directory as starting points; they do not imply one EU-wide licence. National registration, scope, language, insurance, telehealth, reimbursement, patient-safety and laboratory rules remain separate.

## Evidence required before activation

For an individual doctor or other professional, retain:

1. Identity and legal name matching the application.
2. Current register entry, licence/registration number, status, specialty, conditions and expiry/renewal evidence.
3. Patient location, provider establishment location, service location and permitted telehealth/prescribing scope.
4. Good-standing/disciplinary evidence and professional-liability coverage.
5. Local language, consent, complaints, emergency escalation and continuity-of-care controls.
6. The reviewer, sources, decision, decision date and next review date.

For an individual laboratory, retain:

1. Legal entity, operating location and local facility/laboratory permit.
2. Current accreditation certificate and schedule of accreditation.
3. Exact ISO 15189 or equivalent scope, analytes, collection model and reporting activity.
4. Quality, chain-of-custody, correction and critical-result escalation procedures.
5. Confirmation that the facility may serve the destination patient and that the test may be ordered, marketed and reported there.

Accreditation is evidence of competence within a stated scope; it is not automatically permission to operate, collect specimens, order tests, practise medicine or serve cross-border patients.

## Cross-border and privacy gates

- Country enablement and provider approval are separate decisions.
- In the United States, evaluate patient-location licensure, CLIA/state laboratory status, HIPAA/BAA applicability, FTC Health Breach Notification Rule exposure and state consumer-health-data laws.
- In Canada, document PIPEDA/provincial health-law accountability, foreign processing, contracts, residency expectations and transfer safeguards.
- In the EU/EEA, document GDPR controller/processor roles, Article 9 condition, minimisation, retention, access logging, encryption, processor contracts and any Chapter V transfer mechanism. EU cross-border healthcare and professional-qualification frameworks do not replace national approval.
- In Australia/New Zealand/Singapore, document the applicable overseas-transfer rules, processor contracts, breach process, retention and local service licensing.
- In the UAE, assume health-data localisation and emirate-specific approvals are blockers until written authority review confirms otherwise.

Until these gates are recorded, keep the application pending, do not publish a verified badge, and do not market the service as available in that jurisdiction.

## Sources and research limits

Primary source directories and controls used in the review:

- United States: [HHS telehealth licensure across state lines](https://telehealth.hhs.gov/licensure/licensing-across-state-lines), [HHS licensure compacts](https://telehealth.hhs.gov/licensure/licensure-compacts), [CMS NPI Registry](https://npiregistry.cms.hhs.gov/), [CDC CLIA](https://www.cdc.gov/clia/php/about/index.html), [CMS QCOR](https://qcor.cms.gov/advanced_find_provider.jsp?which=4&backReport=active_CLIA.jsp), [HHS business associates](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html).
- Canada: [Medical Council of Canada regulatory authorities](https://mcc.ca/about/partner-organizations/medical-regulatory-authorities/), [CPSO virtual care](https://www.cpso.on.ca/physicians/policies-guidance/policies/virtual-care), [Ontario laboratory law](https://www.ontario.ca/laws/statute/90l01), [CPSBC Diagnostic Accreditation Program](https://www.cpsbc.ca/accredited-facilities/dap/laboratory-medicine), [CPSA facility accreditation](https://cpsa.ca/facilities-clinics/accreditation/diagnostic-laboratory-medicine/), [Canadian privacy commissioner on PIPEDA](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief).
- EU/EEA/UK: [EU Regulated Professions Database](https://ec.europa.eu/growth/tools-databases/regprof/professions/bycountry), [Directive 2005/36/EC](https://eur-lex.europa.eu/eli/dir/2005/36/oj/eng), [GDPR consolidated text](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02016R0679-20160504), [EU cross-border healthcare Directive 2011/24/EU](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0024), [European Accreditation directory](https://european-accreditation.org/ea-members/directory-of-ea-members-and-mla-signatories/), [GMC register](https://www.gmc-uk.org/registration-and-licensing/the-medical-register).
- Australia/New Zealand: [Ahpra registers](https://www.ahpra.gov.au/Registration/Registers-of-Practitioners), [NATA medical laboratories](https://nata.com.au/accreditation/medical-laboratory-accreditation-iso-15189), [MCNZ register](https://www.mcnz.org.nz/registration/register-of-doctors/), [IANZ medical laboratories](https://www.ianz.govt.nz/programmes/medical-laboratory/), [OAIC APP 8](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information), [New Zealand Health Information Privacy Code](https://www.privacy.org.nz/privacy-principles/codes-of-practice/hipc2020/).
- India: [NMC Indian Medical Register](https://www.nmc.org.in/information-desk/indian-medical-register), [India Telemedicine Practice Guidelines](http://esanjeevani.mohfw.gov.in/assets/guidelines/Telemedicine_Practice_Guidelines.pdf), [NABL medical testing](https://nabl-india.org/wp-content/uploads/2025/09/Medical-Testing.pdf), [Clinical Establishments overview](https://clinicalestablishments.mohfw.gov.in/en/about-us), [MeitY DPDP commencement timeline](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf).
- Singapore/UAE: [SMC registration](https://www.smc.gov.sg/for-professionals/apply-for-registration/), [Singapore HCSA medical service](https://www.hcsa.gov.sg/outpatient-services/outpatient-medical-service/), [HCSA clinical laboratory service](https://www.hcsa.gov.sg/clinical-support-services/clinical-laboratory-service), [PDPC cross-border transfers](https://www.pdpc.gov.sg/organisations/resources/guidance-by-topic/guide-to-cross-border-data-transfers), [UAE Unified PQR](https://services.dha.gov.ae/sheryan/wps/contenthandler/war/SheryanHomeThemeStatic/themes/Portal8.5/docs/PQR_April_2025.pdf), [DHA telehealth standard](https://dha.gov.ae/uploads/012023/Standards%20for%20Telehealth%20Services2023158613.pdf), [UAE Federal Law No. 2 of 2019](https://uaelegislation.gov.ae/en/legislations/1209/download).

Research limitations: the review did not inspect any individual credential, all U.S. states, all Canadian provinces/territories, every Australian or Indian subnational rule, payments/tax/advertising/reimbursement, or KynthAI's final legal classification. Dynamic registers and accreditation schedules must be checked again at each provider decision. Several official pages were unavailable or blocked during the review; inaccessible evidence was treated as a reason to remain pending, not as approval.
