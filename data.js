// ============================================================
// DEMAT-BT-BDSN - Données et fonctions partagées
// AI Boucle de Seine Nord - GRDF
// ============================================================

const APP_CONFIG = {
    siteName: 'AI BOUCLE DE SEINE NORD',
    date: '2026-01-19',
    dateDisplay: 'Lundi 19 Janvier 2026',
    logoUrl: 'https://raw.githubusercontent.com/rachidben91-web/Lecteur-plan-terrain/main/assets/logo-grdf-bdsn1.png'
};

// ============================================================
// DONNÉES DES MANAGERS
// ============================================================
const MANAGERS = [
    { id: 'M001', name: 'THERY Franck', nni: 'C80448', role: 'Chef d\'agence', site: 'VLG', color: '#00A3E0' },
    { id: 'M002', name: 'GUENFOUD Heidine', nni: 'B65570', role: 'Adjoint CA', site: 'VLG', color: '#0077A8' },
    { id: 'M003', name: 'GOURVENEC Brieuc', nni: 'F68078', role: 'Adjoint CA', site: 'SAR', color: '#0077A8' },
    { id: 'M004', name: 'NHIV Narith', nni: 'F23382', role: 'Manager équipe', site: 'VLG', color: '#9B59B6' },
    { id: 'M005', name: 'ZERAMDINI Zied', nni: 'J00654', role: 'Manager équipe', site: 'VLG', color: '#8E44AD' },
    { id: 'M006', name: 'DEBOUSSI Karim', nni: 'J00354', role: 'Manager équipe', site: 'VLG', color: '#7D3C98' },
    { id: 'M007', name: 'ROMAO Laetitia', nni: 'C53976', role: 'Manager équipe', site: 'VLG', color: '#6C3483' },
    { id: 'M008', name: 'ARBIB Mustapha', nni: 'I73173', role: 'Manager équipe', site: 'VLG', color: '#5B2C6F' },
    { id: 'M009', name: 'SALEMKOUR Sabrina', nni: 'E41148', role: 'Manager équipe', site: 'VLG', color: '#4A235A' },
    { id: 'M010', name: 'BEN DAOUD Rachid', nni: 'J60772', role: 'Manager équipe', site: 'VLG', color: '#76448A' },
    { id: 'M011', name: 'YAGOUBI Walid', nni: 'G58854', role: 'Manager équipe', site: 'SAR', color: '#E67E22' },
    { id: 'M012', name: 'ICHOUHID-AYADI Milia', nni: 'J57273', role: 'Manager équipe', site: 'SAR', color: '#D35400' }
];

// ============================================================
// DONNÉES DES TECHNICIENS (Liste complète MAIA)
// ============================================================
const TECHNICIANS = [
    // Référents d'équipe
    { id: 'T001', name: 'KHALI Mounir', nni: 'H61582', role: 'RE', site: 'VLG', managerId: 'M004', color: '#E67E22' },
    { id: 'T002', name: 'BETTENCOURT DIAS Gil', nni: 'G48754', role: 'RE', site: 'VLG', managerId: 'M010', color: '#D35400' },
    { id: 'T003', name: 'LE BRIS Christophe', nni: 'E82673', role: 'RE', site: 'VLG', managerId: 'M009', color: '#CA6F1E' },
    { id: 'T004', name: 'N\'TUMBA BYN Rudy', nni: 'J29155', role: 'RE', site: 'VLG', managerId: 'M006', color: '#BA4A00' },
    { id: 'T005', name: 'MILLET Romain', nni: 'A19376', role: 'RE', site: 'SAR', managerId: 'M011', color: '#A04000' },
    { id: 'T006', name: 'OSSOU Ludovic', nni: 'J73272', role: 'RE', site: 'SAR', managerId: 'M012', color: '#873600' },
    
    // Référents techniques
    { id: 'T007', name: 'BOIVIN Cyril', nni: 'A61654', role: 'RT', site: 'VLG', managerId: 'M008', color: '#1ABC9C' },
    { id: 'T008', name: 'ELIASAINT Ruth', nni: 'D89183', role: 'RT', site: 'VLG', managerId: 'M010', color: '#16A085' },
    { id: 'T009', name: 'ROUGERON Anthony', nni: 'D03378', role: 'RT', site: 'VLG', managerId: 'M005', color: '#148F77' },
    { id: 'T010', name: 'RULLE Guillaume', nni: 'G27777', role: 'RT', site: 'VLG', managerId: 'M006', color: '#117A65' },
    { id: 'T011', name: 'SIMON Thomas', nni: 'H12877', role: 'RT', site: 'VLG', managerId: 'M005', color: '#0E6655' },
    { id: 'T012', name: 'BAUNIER Jennifer', nni: 'G86275', role: 'RT', site: 'SAR', managerId: 'M012', color: '#0B5345' },
    { id: 'T013', name: 'DEGOUY Grégory', nni: 'B06751', role: 'RT', site: 'SAR', managerId: 'M012', color: '#1ABC9C' },
    { id: 'T014', name: 'MERCEY Bruno', nni: 'H86956', role: 'RT', site: 'SAR', managerId: 'M011', color: '#17A589' },
    
    // Techniciens Gaz - Équipe Narith NHIV
    { id: 'T015', name: 'CAUSSARIEU Thomas', nni: 'A94073', role: 'TG', site: 'VLG', managerId: 'M004', color: '#3498DB' },
    { id: 'T016', name: 'DESFONTAINES Richard', nni: 'E51772', role: 'TG', site: 'VLG', managerId: 'M004', color: '#2E86C1' },
    { id: 'T017', name: 'FOURMONT Cédric', nni: 'I20971', role: 'TG', site: 'VLG', managerId: 'M004', color: '#2874A6' },
    { id: 'T018', name: 'HARBOULI Rachid', nni: 'H49056', role: 'TG', site: 'VLG', managerId: 'M004', color: '#21618C' },
    { id: 'T019', name: 'JOUANNE Alexandre', nni: 'C20671', role: 'TG', site: 'VLG', managerId: 'M004', color: '#1B4F72' },
    { id: 'T020', name: 'KLEIN Julien', nni: 'J24255', role: 'TG', site: 'VLG', managerId: 'M004', color: '#00BCD4' },
    { id: 'T021', name: 'LE BOMIN Thomas', nni: 'G47781', role: 'TG', site: 'VLG', managerId: 'M004', color: '#00ACC1' },
    { id: 'T022', name: 'VAN-UXEN Robert', nni: 'J14432', role: 'TG', site: 'VLG', managerId: 'M004', color: '#0097A7' },
    { id: 'T023', name: 'DUBO Romain', nni: 'D10385', role: 'Apprenti', site: 'VLG', managerId: 'M004', color: '#00838F' },
    
    // Techniciens Gaz - Équipe Zied ZERAMDINI
    { id: 'T024', name: 'ARIF Kamel', nni: 'F62981', role: 'TG', site: 'VLG', managerId: 'M005', color: '#9C27B0' },
    { id: 'T025', name: 'DUCOLLET Jérémy', nni: 'J04081', role: 'TG', site: 'VLG', managerId: 'M005', color: '#8E24AA' },
    { id: 'T026', name: 'GALLEDOU Sikhou', nni: 'A67070', role: 'TG', site: 'VLG', managerId: 'M005', color: '#7B1FA2' },
    { id: 'T027', name: 'HENRY Alexandre', nni: 'C33576', role: 'TG', site: 'VLG', managerId: 'M005', color: '#6A1B9A' },
    { id: 'T028', name: 'HUET Frédéric', nni: 'E82472', role: 'TG', site: 'VLG', managerId: 'M005', color: '#4A148C' },
    { id: 'T029', name: 'SEGUY Alexis', nni: 'C35074', role: 'TG', site: 'VLG', managerId: 'M005', color: '#E67E22' },
    { id: 'T030', name: 'SISSOKO Tiémoko', nni: 'E06180', role: 'TG', site: 'VLG', managerId: 'M005', color: '#D35400' },
    
    // Techniciens Gaz - Équipe Karim DEBOUSSI
    { id: 'T031', name: 'BENALLOU Radouane', nni: 'A02277', role: 'TG', site: 'VLG', managerId: 'M006', color: '#E74C3C' },
    { id: 'T032', name: 'BENTOUMI Mounir', nni: 'E50275', role: 'TG', site: 'VLG', managerId: 'M006', color: '#F5A623' },
    { id: 'T033', name: 'CISSE Amadou', nni: 'B99384', role: 'TG', site: 'VLG', managerId: 'M006', color: '#FF5722' },
    { id: 'T034', name: 'FELHI Mohamed', nni: 'I16183', role: 'TG', site: 'VLG', managerId: 'M006', color: '#FF7043' },
    { id: 'T035', name: 'MAGASSOUBA Mohamed', nni: 'C30671', role: 'TG', site: 'VLG', managerId: 'M006', color: '#FF8A65' },
    { id: 'T036', name: 'SALEP Alexandre', nni: 'G82872', role: 'TG', site: 'VLG', managerId: 'M006', color: '#00BCD4' },
    { id: 'T037', name: 'TAKROUNI Jamila', nni: 'H64778', role: 'TG', site: 'VLG', managerId: 'M006', color: '#E91E63' },
    
    // Techniciens Gaz - Équipe Laetitia ROMAO
    { id: 'T038', name: 'ABIR Bilal', nni: 'H26975', role: 'TG', site: 'VLG', managerId: 'M007', color: '#3498DB' },
    { id: 'T039', name: 'CISSE Moussa', nni: 'I13252', role: 'TG', site: 'VLG', managerId: 'M007', color: '#E74C3C' },
    { id: 'T040', name: 'CORREIA Christopher', nni: 'A37272', role: 'TG', site: 'VLG', managerId: 'M007', color: '#2980B9' },
    { id: 'T041', name: 'DEBY Medhi', nni: 'J19576', role: 'TG', site: 'VLG', managerId: 'M007', color: '#1F618D' },
    { id: 'T042', name: 'DUBOIS Guillaume', nni: 'E34879', role: 'TG', site: 'VLG', managerId: 'M007', color: '#154360' },
    { id: 'T043', name: 'SHEIKH Arslan', nni: 'F80482', role: 'TG', site: 'VLG', managerId: 'M007', color: '#1A5276' },
    { id: 'T044', name: 'TCHERNIAWSKY Christophe', nni: 'C18572', role: 'TG', site: 'VLG', managerId: 'M007', color: '#1B4F72' },
    
    // Techniciens Gaz - Équipe Mustapha ARBIB
    { id: 'T045', name: 'ASSOUMO Alain-Bruno', nni: 'D45777', role: 'TG', site: 'VLG', managerId: 'M008', color: '#9B59B6' },
    { id: 'T046', name: 'DADSI Amine', nni: 'E23680', role: 'TG', site: 'VLG', managerId: 'M008', color: '#8E44AD' },
    { id: 'T047', name: 'ESSOBAT NFONZOCK Judith', nni: 'I20180', role: 'TG', site: 'VLG', managerId: 'M008', color: '#7D3C98' },
    { id: 'T048', name: 'HAJJI Toufik', nni: 'C53276', role: 'TG', site: 'VLG', managerId: 'M008', color: '#6C3483' },
    { id: 'T049', name: 'MAMMOU Mounir', nni: 'G90777', role: 'TG', site: 'VLG', managerId: 'M008', color: '#5B2C6F' },
    { id: 'T050', name: 'SISSOKO Seran', nni: 'F86682', role: 'TG', site: 'VLG', managerId: 'M008', color: '#795548' },
    { id: 'T051', name: 'TELDJI Djamel', nni: 'H11281', role: 'TG', site: 'VLG', managerId: 'M008', color: '#4CAF50' },
    { id: 'T052', name: 'TEMUR Berkay Can', nni: 'X01563', role: 'TG', site: 'VLG', managerId: 'M008', color: '#8BC34A' },
    
    // Techniciens Gaz - Équipe Sabrina SALEMKOUR
    { id: 'T053', name: 'DIALLO Amadou', nni: 'A73777', role: 'TG', site: 'VLG', managerId: 'M009', color: '#FF9800' },
    { id: 'T054', name: 'GNEBIO Noël', nni: 'G59180', role: 'TG', site: 'VLG', managerId: 'M009', color: '#FFA726' },
    { id: 'T055', name: 'GUFFROY Maxime', nni: 'G81772', role: 'TG', site: 'VLG', managerId: 'M009', color: '#FFB74D' },
    { id: 'T056', name: 'THE Romain', nni: 'E23670', role: 'TG', site: 'VLG', managerId: 'M009', color: '#FFCC80' },
    { id: 'T057', name: 'TOUIL Mourad', nni: 'D80482', role: 'TG', site: 'VLG', managerId: 'M009', color: '#FFE0B2' },
    { id: 'T058', name: 'VERTIL Wilco', nni: 'A77455', role: 'TG', site: 'VLG', managerId: 'M009', color: '#607D8B' },
    { id: 'T059', name: 'WELLE David', nni: 'A31480', role: 'TG', site: 'VLG', managerId: 'M009', color: '#78909C' },
    
    // Techniciens Gaz - Équipe Rachid BEN DAOUD
    { id: 'T060', name: 'BEEHARRY-PANRAY Sanjeet', nni: 'B09571', role: 'TG', site: 'VLG', managerId: 'M010', color: '#009688' },
    { id: 'T061', name: 'BRIET Dylan', nni: 'C38084', role: 'TG', site: 'VLG', managerId: 'M010', color: '#00796B' },
    { id: 'T062', name: 'NAVAUX Aurélien', nni: 'A39083', role: 'TG', site: 'VLG', managerId: 'M010', color: '#00695C' },
    { id: 'T063', name: 'ROBICHON Jordan', nni: 'A14356', role: 'TG', site: 'VLG', managerId: 'M010', color: '#00BFA5' },
    { id: 'T064', name: 'STEHELYN Hakim', nni: 'E10173', role: 'TG', site: 'VLG', managerId: 'M010', color: '#FF5722' },
    
    // Techniciens Gaz - Équipe Walid YAGOUBI (Sartrouville)
    { id: 'T065', name: 'ARKAN Mesut', nni: 'C61984', role: 'TG', site: 'SAR', managerId: 'M011', color: '#FF5722' },
    { id: 'T066', name: 'BAZZI Yassine', nni: 'A67876', role: 'TG', site: 'SAR', managerId: 'M011', color: '#E64A19' },
    { id: 'T067', name: 'BORG Steven', nni: 'A27971', role: 'TG', site: 'SAR', managerId: 'M011', color: '#D84315' },
    { id: 'T068', name: 'CLINQUART Cédric', nni: 'H47480', role: 'TG', site: 'SAR', managerId: 'M011', color: '#BF360C' },
    { id: 'T069', name: 'DRAME Yakhouba', nni: 'J72179', role: 'TG', site: 'SAR', managerId: 'M011', color: '#8D6E63' },
    { id: 'T070', name: 'DUBOIS Fabien', nni: 'D29157', role: 'TG', site: 'SAR', managerId: 'M011', color: '#6D4C41' },
    { id: 'T071', name: 'GLAIZE Cédric', nni: 'J03649', role: 'TG', site: 'SAR', managerId: 'M011', color: '#5D4037' },
    { id: 'T072', name: 'MOCKBEL Abdelkrim', nni: 'A20571', role: 'TG', site: 'SAR', managerId: 'M011', color: '#4E342E' },
    { id: 'T073', name: 'THIBOYEAU Mickael', nni: 'J36853', role: 'TG', site: 'SAR', managerId: 'M011', color: '#3E2723' },
    
    // Techniciens Gaz - Équipe Milia ICHOUHID-AYADI (Sartrouville)
    { id: 'T074', name: 'BIELEU LEUKOUE Serge', nni: 'F10684', role: 'TG', site: 'SAR', managerId: 'M012', color: '#673AB7' },
    { id: 'T075', name: 'BLIN Maxime', nni: 'J90872', role: 'TG', site: 'SAR', managerId: 'M012', color: '#512DA8' },
    { id: 'T076', name: 'GOMIS Lucien', nni: 'I08754', role: 'TG', site: 'SAR', managerId: 'M012', color: '#4527A0' },
    { id: 'T077', name: 'KITENGE MULAMBULUA Pagnol', nni: 'J97683', role: 'TG', site: 'SAR', managerId: 'M012', color: '#311B92' },
    { id: 'T078', name: 'LARIBE Joris', nni: 'G38382', role: 'TG', site: 'SAR', managerId: 'M012', color: '#7C4DFF' },
    { id: 'T079', name: 'PICCININ Alexandre', nni: 'B51877', role: 'TG', site: 'SAR', managerId: 'M012', color: '#651FFF' },
    { id: 'T080', name: 'SEIDY Mahamadou', nni: 'G71881', role: 'TG', site: 'SAR', managerId: 'M012', color: '#6200EA' },
    { id: 'T081', name: 'TAVARES Steven', nni: 'A38084', role: 'TG', site: 'SAR', managerId: 'M012', color: '#AA00FF' },
    { id: 'T082', name: 'THIEBAUT Florian', nni: 'E24956', role: 'TG', site: 'SAR', managerId: 'M012', color: '#D500F9' },
    
    // Appui
    { id: 'T083', name: 'KHALLADI Aleksandra', nni: 'F54357', role: 'Appui TA', site: 'VLG', managerId: 'M008', color: '#E91E63' },
    { id: 'T084', name: 'EKOUME Erika', nni: 'J64778', role: 'Appui Admin', site: 'VLG', managerId: 'M001', color: '#F06292' },
    { id: 'T085', name: 'LOYER Thibauld', nni: 'X01635', role: 'Appui CI', site: 'VLG', managerId: 'M001', color: '#EC407A' },
    { id: 'T086', name: 'BONNETERRE Jean-Charles', nni: 'B71532', role: 'Appui Pro', site: 'VLG', managerId: 'M002', color: '#AD1457' }
];

// ============================================================
// DONNÉES DES BONS DE TRAVAIL (BT)
// ============================================================
const BT_DATA = [
    {
        id: 'BT22626000801',
        type: 'mhs',
        typeLabel: 'MHS',
        title: 'MHS n° U0169TT3 AVEC DEPOSE COMPTEUR',
        client: 'M. TOMAS CHRISTOPHE',
        phone: '0676873110',
        address: '20 RUE HOCHE 92700 COLOMBES',
        commune: 'COLOMBES',
        pdl: 'GI040987',
        compteur: 'G25',
        duration: '01:00',
        timeStart: '13:00',
        timeEnd: '14:00',
        status: 'pending',
        priority: 'normal',
        assignedTo: ['T038', 'T015'], // ABIR Bilal, CAUSSARIEU Thomas
        team: [
            { techId: 'T038', role: 'Chef de travaux' },
            { techId: 'T015', role: 'Opérateur' }
        ],
        observations: 'MHS n° U0169TT3 AVEC DEPOSE COMPTEUR/ GI040987 / G25 / FOR113 + PHOTOS / PO 13H30',
        documents: ['FOR113', 'PHOTOS'],
        eotp: 'V11AD-AQ21',
        createdAt: '2026-01-18T14:30:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22626000781',
        type: 'mes',
        typeLabel: 'MES',
        title: 'CHGT CPTR + POSE MODULE n°DE09HTS2',
        client: 'Mme MAAFI-YOUNG',
        phone: '0617303087',
        address: '263 RUE DES GROS GRES 92700 COLOMBES',
        commune: 'COLOMBES',
        pdl: '21548335663519',
        compteur: 'G25 + Module',
        duration: '01:00',
        timeStart: '14:00',
        timeEnd: '15:00',
        status: 'pending',
        priority: 'normal',
        assignedTo: ['T038', 'T015'],
        team: [
            { techId: 'T038', role: 'Chef de travaux' },
            { techId: 'T015', role: 'Opérateur' }
        ],
        observations: 'CHANGEMENT DE COMPTEUR + POSE MODULE // G25 // MME MAAFI YOUNG 06 17 30 30 87',
        documents: ['FOR113', 'MAT COMPLET', 'PHOTO'],
        eotp: 'V11AD-AR07',
        createdAt: '2026-01-18T10:00:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22626000818',
        type: 'maintenance',
        typeLabel: 'MAINT CI-CM',
        title: 'Maintenance préventive CI-CM - IS JOUR 1',
        client: '',
        phone: '',
        address: '92390 VILLENEUVE LA GARENNE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '09:00',
        timeStart: '07:30',
        timeEnd: '16:30',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T045'],
        team: [
            { techId: 'T045', role: 'OIS' }
        ],
        observations: 'Réaliser la maintenance préventive (INS, REV, SCI, INS OCG) selon le prescrit. Traiter tous les champs de l\'inventaire dans la GMAO.',
        documents: [],
        eotp: 'V11AD-RF03',
        createdAt: '2026-01-17T16:00:00',
        updatedAt: '2026-01-19T07:35:00'
    },
    {
        id: 'BT22625034621',
        type: 'adf',
        typeLabel: 'SURVEILLANCE',
        title: 'Surveillance ADF RP22624011481',
        client: '',
        phone: '',
        address: '59 AVENUE CHARLES DE GAULLE 95160 MONTMORENCY',
        commune: 'MONTMORENCY',
        pdl: '',
        compteur: '',
        duration: '02:00',
        timeStart: '07:30',
        timeEnd: '09:30',
        status: 'completed',
        priority: 'high',
        assignedTo: ['T032', 'T039'],
        team: [
            { techId: 'T032', role: 'Chef de travaux' },
            { techId: 'T039', role: 'Opérateur' }
        ],
        observations: '11/09/2024 suite surveillance plus aucun indice détecté sur la ligature. Contacter le BEX pour rendre compte.',
        documents: ['PLANS'],
        eotp: 'V11AD-R124',
        createdAt: '2026-01-15T08:00:00',
        updatedAt: '2026-01-19T09:35:00'
    },
    {
        id: 'BT22625017454',
        type: 'adf',
        typeLabel: 'SURVEILLANCE',
        title: 'Surveillance ADF RP22625009441',
        client: '',
        phone: '',
        address: '33 AVENUE GALLIENI 93800 EPINAY SUR SEINE',
        commune: 'EPINAY SUR SEINE',
        pdl: '',
        compteur: '',
        duration: '02:00',
        timeStart: '09:30',
        timeEnd: '11:30',
        status: 'inprogress',
        priority: 'high',
        assignedTo: ['T032', 'T039'],
        team: [
            { techId: 'T032', role: 'Chef de travaux' },
            { techId: 'T039', role: 'Opérateur' }
        ],
        observations: 'Surveillance de l\'ADF. Récupérer le dossier ADF. Tracer les réseaux gaz et élec au sol.',
        documents: [],
        eotp: 'V11AD-RD33',
        createdAt: '2026-01-16T14:00:00',
        updatedAt: '2026-01-19T09:30:00'
    },
    {
        id: 'BT22626001136',
        type: 'adf',
        typeLabel: 'LOCALISATION',
        title: 'Localisation fuite ADF22626000281',
        client: '',
        phone: '',
        address: '1 RUE AMPERE 92700 COLOMBES PAV',
        commune: 'COLOMBES',
        pdl: '',
        compteur: '',
        duration: '01:30',
        timeStart: '13:00',
        timeEnd: '14:30',
        status: 'pending',
        priority: 'high',
        assignedTo: ['T032', 'T039'],
        team: [
            { techId: 'T032', role: 'Chef de travaux' },
            { techId: 'T039', role: 'Opérateur' }
        ],
        observations: 'Localisation de fuite. Réaliser les sondages sur chaussée et/ou trottoir.',
        documents: [],
        eotp: 'V11AD-RD15',
        createdAt: '2026-01-18T16:30:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22626000822',
        type: 'maintenance',
        typeLabel: 'MAINT CI-CM',
        title: 'Maintenance préventive CI-CM - DEP 3',
        client: '',
        phone: '',
        address: '92390 VILLENEUVE LA GARENNE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '04:30',
        timeStart: '07:30',
        timeEnd: '12:00',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T040'],
        team: [
            { techId: 'T040', role: 'OIS' }
        ],
        observations: 'Maintenance préventive CI-CM. Traiter les OT VSIC associés.',
        documents: [],
        eotp: 'V11AD-RF03',
        createdAt: '2026-01-17T16:00:00',
        updatedAt: '2026-01-19T07:32:00'
    },
    {
        id: 'BT22625034924',
        type: 'formation',
        typeLabel: 'MDC CUIVRE',
        title: 'Maintien de compétence soudage cuivre',
        client: '',
        phone: '',
        address: '137 BD CHARLES DE GAULLE 92390 VLG - AIRE PÉDAGOGIQUE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '01:30',
        timeStart: '13:00',
        timeEnd: '14:30',
        status: 'pending',
        priority: 'normal',
        assignedTo: ['T040'],
        team: [
            { techId: 'T040', role: 'Stagiaire' }
        ],
        observations: 'Maintien de compétence soudage cuivre sur l\'aire pédagogique de VLG',
        documents: [],
        eotp: 'V11AD-RD24',
        createdAt: '2026-01-15T09:00:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22625034925',
        type: 'formation',
        typeLabel: 'MDC PE',
        title: 'Maintien de compétence soudage PE - Création BRCH',
        client: '',
        phone: '',
        address: '137 BD CHARLES DE GAULLE 92390 VLG - AIRE PÉDAGOGIQUE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '02:00',
        timeStart: '14:30',
        timeEnd: '16:30',
        status: 'pending',
        priority: 'normal',
        assignedTo: ['T040'],
        team: [
            { techId: 'T040', role: 'Stagiaire' }
        ],
        observations: 'MAINTIEN DE COMPETENCE SOUDAGE PE - CREATION DE BRCH ET RACCORDEMENT EN LIGNE',
        documents: [],
        eotp: 'V11AD-RD24',
        createdAt: '2026-01-15T09:00:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22626001204',
        type: 'maintenance',
        typeLabel: 'RENOUV. BRCHT',
        title: 'Renouvellement branchement BP Fonte DN170',
        client: '',
        phone: '',
        address: '31 RUE HOCHE 92270 BOIS COLOMBES',
        commune: 'BOIS COLOMBES',
        pdl: '',
        compteur: '',
        duration: '04:00',
        timeStart: '08:00',
        timeEnd: '12:00',
        status: 'inprogress',
        priority: 'high',
        assignedTo: ['T020', 'T029'],
        team: [
            { techId: 'T020', role: 'Chef de travaux' },
            { techId: 'T029', role: 'Opérateur' }
        ],
        observations: 'CR APRES OUVERTURE: 35%LIE SUR LA PRISE ET 30%LIE SUR TROU DE BALLON (serrage fait, contrôle 0%LIE). Branchement à renouveler suite fuite robinet prise. Bande de graisse renforcée posée, contrôle 3%LIE de part et d\'autre de la fouille.',
        documents: ['AT', 'PLANS', 'PHOTOS'],
        eotp: 'V11AD-R124',
        createdAt: '2026-01-16T10:00:00',
        updatedAt: '2026-01-19T08:15:00'
    },
    {
        id: 'BT22626001141',
        type: 'maintenance',
        typeLabel: 'CORRECT.',
        title: 'Changement compteur grippé - Traitement RP 0661',
        client: '',
        phone: '',
        address: '14 RUE DANIEL 92600 ASNIERES SUR SEINE - 3ème étage Folio 470',
        commune: 'ASNIERES SUR SEINE',
        pdl: '',
        compteur: '',
        duration: '03:30',
        timeStart: '13:00',
        timeEnd: '16:30',
        status: 'pending',
        priority: 'normal',
        assignedTo: ['T020', 'T029'],
        team: [
            { techId: 'T020', role: 'Chef de travaux' },
            { techId: 'T029', role: 'Opérateur' }
        ],
        observations: 'Suite demande changement du compteur écrous grippés - voir pour dé-grippage et changement compteur.',
        documents: ['AT', 'PHOTOS'],
        eotp: 'V11AD-RD15',
        createdAt: '2026-01-18T11:00:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22625034713',
        type: 'administratif',
        typeLabel: 'RÉUNION',
        title: 'Réunion équipe managériale Narith / Zied',
        client: '',
        phone: '',
        address: '137 BD CHARLES DE GAULLE 92390 VLG',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '04:00',
        timeStart: '08:00',
        timeEnd: '12:00',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T001'],
        team: [
            { techId: 'T001', role: 'Participant' }
        ],
        observations: 'Réunion d\'équipe managériale',
        documents: [],
        eotp: 'V11AD-RM14',
        createdAt: '2026-01-12T10:00:00',
        updatedAt: '2026-01-19T08:00:00'
    },
    {
        id: 'BT22626000369',
        type: 'mhs',
        typeLabel: 'PI VAINES',
        title: 'Passage Interventions Vaines 92/93/95',
        client: '',
        phone: '',
        address: '137 BD CHARLES DE GAULLE 92390 VLG',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '09:00',
        timeStart: '07:30',
        timeEnd: '16:30',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T083'],
        team: [
            { techId: 'T083', role: 'OIS' }
        ],
        observations: 'Passage interventions vaines départements 92/93/95',
        documents: [],
        eotp: 'V11AD-AQ27',
        createdAt: '2026-01-17T14:00:00',
        updatedAt: '2026-01-19T07:33:00'
    },
    {
        id: 'BT22626000861',
        type: 'maintenance',
        typeLabel: 'MAINT CI-CM',
        title: 'Maintenance CI-CM IS J2 avec doublon SAR',
        client: '',
        phone: '',
        address: '92390 VILLENEUVE LA GARENNE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '09:00',
        timeStart: '07:30',
        timeEnd: '16:30',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T036', 'T065'],
        team: [
            { techId: 'T036', role: 'Chef de travaux' },
            { techId: 'T065', role: 'Opérateur' }
        ],
        observations: 'Maintenance préventive CI-CM avec doublon Sartrouville (M. ARKAN)',
        documents: [],
        eotp: 'V11AD-RF03',
        createdAt: '2026-01-17T16:00:00',
        updatedAt: '2026-01-19T07:35:00'
    },
    {
        id: 'BT22626001035',
        type: 'adf',
        typeLabel: 'RSF',
        title: 'Recherche Systématique Fuite - Matin',
        client: '',
        phone: '',
        address: '92390 VILLENEUVE LA GARENNE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '04:30',
        timeStart: '07:30',
        timeEnd: '12:00',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T050'],
        team: [
            { techId: 'T050', role: 'OIS' }
        ],
        observations: 'Recherche systématique de fuite à pied sur réseau GN - secteur VLG matin',
        documents: [],
        eotp: 'V11AD-RF09',
        createdAt: '2026-01-17T16:00:00',
        updatedAt: '2026-01-19T07:32:00'
    },
    {
        id: 'BT22626001036',
        type: 'adf',
        typeLabel: 'RSF',
        title: 'Recherche Systématique Fuite - Après-midi',
        client: '',
        phone: '',
        address: '92390 VILLENEUVE LA GARENNE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '04:30',
        timeStart: '13:00',
        timeEnd: '17:30',
        status: 'pending',
        priority: 'normal',
        assignedTo: ['T058'],
        team: [
            { techId: 'T058', role: 'OIS' }
        ],
        observations: 'Recherche systématique de fuite à pied sur réseau GN - secteur VLG après-midi',
        documents: [],
        eotp: 'V11AD-RF09',
        createdAt: '2026-01-17T16:00:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22626001037',
        type: 'maintenance',
        typeLabel: 'MAINT CI-CM',
        title: 'Maintenance CI-CM IS J3',
        client: '',
        phone: '',
        address: '92390 VILLENEUVE LA GARENNE',
        commune: 'VILLENEUVE LA GARENNE',
        pdl: '',
        compteur: '',
        duration: '09:00',
        timeStart: '07:30',
        timeEnd: '16:30',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T051'],
        team: [
            { techId: 'T051', role: 'OIS' }
        ],
        observations: 'Maintenance préventive CI-CM - Inspection Systématique Jour 3',
        documents: [],
        eotp: 'V11AD-RF03',
        createdAt: '2026-01-17T16:00:00',
        updatedAt: '2026-01-19T07:34:00'
    },
    {
        id: 'BT22626001200',
        type: 'mes',
        typeLabel: 'MES',
        title: 'Mise en service nouveau branchement',
        client: 'SCI LES MUSICIENS',
        phone: '0145678923',
        address: '12 RUE MOZART 92270 BOIS COLOMBES',
        commune: 'BOIS COLOMBES',
        pdl: '21548335789012',
        compteur: 'G4',
        duration: '01:30',
        timeStart: '09:00',
        timeEnd: '10:30',
        status: 'inprogress',
        priority: 'normal',
        assignedTo: ['T016'],
        team: [
            { techId: 'T016', role: 'OIS' }
        ],
        observations: 'MES nouveau branchement suite travaux. Vérifier conformité installation intérieure.',
        documents: ['FOR113', 'CERTIFICAT CONFORMITE'],
        eotp: 'V11AD-AR07',
        createdAt: '2026-01-18T09:00:00',
        updatedAt: '2026-01-19T09:05:00'
    },
    {
        id: 'BT22626001201',
        type: 'mhs',
        typeLabel: 'MHS',
        title: 'MHS pour travaux rénovation',
        client: 'M. DUPONT Pierre',
        phone: '0612345678',
        address: '45 AVENUE DE LA REPUBLIQUE 92000 NANTERRE',
        commune: 'NANTERRE',
        pdl: 'GI041234',
        compteur: 'G4',
        duration: '00:45',
        timeStart: '11:00',
        timeEnd: '11:45',
        status: 'pending',
        priority: 'normal',
        assignedTo: ['T016'],
        team: [
            { techId: 'T016', role: 'OIS' }
        ],
        observations: 'MHS demandée par client pour travaux de rénovation cuisine. Prévoir remise en service dans 3 semaines.',
        documents: ['FOR113'],
        eotp: 'V11AD-AQ21',
        createdAt: '2026-01-18T14:00:00',
        updatedAt: '2026-01-19T07:00:00'
    },
    {
        id: 'BT22626001202',
        type: 'adf',
        typeLabel: 'LOCALISATION',
        title: 'Localisation fuite signalée riverain',
        client: '',
        phone: '',
        address: '78 RUE VICTOR HUGO 93800 EPINAY SUR SEINE',
        commune: 'EPINAY SUR SEINE',
        pdl: '',
        compteur: '',
        duration: '02:00',
        timeStart: '14:00',
        timeEnd: '16:00',
        status: 'pending',
        priority: 'high',
        assignedTo: ['T053', 'T054'],
        team: [
            { techId: 'T053', role: 'Chef de travaux' },
            { techId: 'T054', role: 'Opérateur' }
        ],
        observations: 'Odeur de gaz signalée par riverain. Intervention prioritaire. Coordonner avec mairie si besoin fermeture voie.',
        documents: [],
        eotp: 'V11AD-RD15',
        createdAt: '2026-01-19T06:30:00',
        updatedAt: '2026-01-19T07:00:00'
    }
];

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getTechnicianById(id) {
    return TECHNICIANS.find(t => t.id === id) || null;
}

function getManagerById(id) {
    return MANAGERS.find(m => m.id === id) || null;
}

function getTechnicianByNni(nni) {
    return TECHNICIANS.find(t => t.nni === nni) || null;
}

function getTechniciansByManager(managerId) {
    return TECHNICIANS.filter(t => t.managerId === managerId);
}

function getBTsByTechnician(techId) {
    return BT_DATA.filter(bt => bt.assignedTo.includes(techId));
}

function getBTById(btId) {
    return BT_DATA.find(bt => bt.id === btId) || null;
}

function getStatusLabel(status) {
    const labels = {
        pending: 'En attente',
        inprogress: 'En cours',
        completed: 'Terminé',
        cancelled: 'Annulé'
    };
    return labels[status] || status;
}

function getStatusColor(status) {
    const colors = {
        pending: '#F5A623',
        inprogress: '#00A3E0',
        completed: '#78BE20',
        cancelled: '#E74C3C'
    };
    return colors[status] || '#95A5A6';
}

function getTypeColor(type) {
    const colors = {
        mhs: '#E74C3C',
        mes: '#78BE20',
        maintenance: '#00A3E0',
        adf: '#F5A623',
        formation: '#9B59B6',
        administratif: '#95A5A6'
    };
    return colors[type] || '#95A5A6';
}

function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function timeToPercent(time, startHour = 7, totalHours = 12) {
    const minutes = timeToMinutes(time);
    const startMinutes = startHour * 60;
    return ((minutes - startMinutes) / (totalHours * 60)) * 100;
}

function formatTime(time) {
    return time.replace(':', 'h');
}

function formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\s/g, '');
    return cleaned.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
}

// Stats
function getStats() {
    const total = BT_DATA.length;
    const pending = BT_DATA.filter(bt => bt.status === 'pending').length;
    const inprogress = BT_DATA.filter(bt => bt.status === 'inprogress').length;
    const completed = BT_DATA.filter(bt => bt.status === 'completed').length;
    const activeTechs = [...new Set(BT_DATA.flatMap(bt => bt.assignedTo))].length;
    const highPriority = BT_DATA.filter(bt => bt.priority === 'high').length;
    
    return { total, pending, inprogress, completed, activeTechs, highPriority };
}

// Get technicians with BTs today
function getActiveTechnicians() {
    const techIds = [...new Set(BT_DATA.flatMap(bt => bt.assignedTo))];
    return techIds.map(id => getTechnicianById(id)).filter(Boolean);
}

// Filter BTs
function filterBTs(options = {}) {
    let filtered = [...BT_DATA];
    
    if (options.type && options.type !== 'all') {
        filtered = filtered.filter(bt => bt.type === options.type);
    }
    if (options.status && options.status !== 'all') {
        filtered = filtered.filter(bt => bt.status === options.status);
    }
    if (options.site && options.site !== 'all') {
        filtered = filtered.filter(bt => {
            const techs = bt.assignedTo.map(id => getTechnicianById(id)).filter(Boolean);
            return techs.some(t => t.site === options.site);
        });
    }
    if (options.managerId) {
        filtered = filtered.filter(bt => {
            const techs = bt.assignedTo.map(id => getTechnicianById(id)).filter(Boolean);
            return techs.some(t => t.managerId === options.managerId);
        });
    }
    if (options.techId) {
        filtered = filtered.filter(bt => bt.assignedTo.includes(options.techId));
    }
    if (options.search) {
        const term = options.search.toLowerCase();
        filtered = filtered.filter(bt => 
            bt.id.toLowerCase().includes(term) ||
            bt.title.toLowerCase().includes(term) ||
            bt.address.toLowerCase().includes(term) ||
            (bt.client && bt.client.toLowerCase().includes(term)) ||
            bt.assignedTo.some(id => {
                const tech = getTechnicianById(id);
                return tech && tech.name.toLowerCase().includes(term);
            })
        );
    }
    
    return filtered;
}

// Update BT status (simulation)
function updateBTStatus(btId, newStatus) {
    const bt = BT_DATA.find(b => b.id === btId);
    if (bt) {
        bt.status = newStatus;
        bt.updatedAt = new Date().toISOString();
        return true;
    }
    return false;
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.APP_CONFIG = APP_CONFIG;
    window.MANAGERS = MANAGERS;
    window.TECHNICIANS = TECHNICIANS;
    window.BT_DATA = BT_DATA;
    window.getInitials = getInitials;
    window.getTechnicianById = getTechnicianById;
    window.getManagerById = getManagerById;
    window.getTechniciansByManager = getTechniciansByManager;
    window.getBTsByTechnician = getBTsByTechnician;
    window.getBTById = getBTById;
    window.getStatusLabel = getStatusLabel;
    window.getStatusColor = getStatusColor;
    window.getTypeColor = getTypeColor;
    window.timeToPercent = timeToPercent;
    window.formatTime = formatTime;
    window.formatPhone = formatPhone;
    window.getStats = getStats;
    window.getActiveTechnicians = getActiveTechnicians;
    window.filterBTs = filterBTs;
    window.updateBTStatus = updateBTStatus;
}
