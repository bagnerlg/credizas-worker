// credit-two-stage-worker.js
// Cloudflare Worker - Flujo de crédito en DOS ETAPAS
//
// PASO 1 - PRECALIFICACIÓN (pantalla independiente)
//   DPI + datos básicos + clasificación de ingresos + ingreso promedio mensual + producto/monto.
//
// PASO 2 - COMPLETAR EXPEDIENTE (pantalla independiente)
//   Solo después de respuesta positiva.
//   Selfie con DPI + documento de domicilio + sustento cuando corresponda + digitación + 3 referencias.
//   No repite campos ya capturados en Paso 1.

const MODEL_DEFAULT = "gpt-5.4-mini";
const ZASHOME_CATALOG_URL = "https://api.zashome.dpdns.org/api/integrations/excel/catalog";
const CASE_PREFIX = "case:";
const VENDORS_KEY = "config:vendors"; // compatibilidad legado
const SELLER_PREFIX = "seller:";
const SELLER_FAIL_PREFIX = "sellerfail:";
const SELLER_COOKIE = "credizas_seller";
const CASE_STATUSES = ["SUBIDA","EN REVISION","REQUIERE DATOS","REINGRESADO","APROBADA","RECHAZADA"];
const CASE_PROCESSES = ["PRECALIFICACION","FORMALIZACION DE CREDITO"];
const COVERAGE_KV_KEY = "config:bda_coverage:070-3-37";
const COVERAGE_SOURCE_VERSION = "070-3-37";
const COVERAGE_SEED = {"version":"070-3-37","departments":["ALTA VERAPAZ","BAJA VERAPAZ","CHIMALTENANGO","CHIQUIMULA","EL PROGRESO","ESCUINTLA","GUATEMALA","HUEHUETENANGO","IZABAL","JALAPA","JUTIAPA","PETÉN","QUETZALTENANGO","QUICHÉ","RETALHULEU","SACATEPÉQUEZ","SAN MARCOS","SANTA ROSA","SOLOLÁ","SUCHITEPÉQUEZ","TOTONICAPÁN","ZACAPA"],"areas":[{"department":"SACATEPÉQUEZ","municipality":"ANTIGUA GUATEMALA"},{"department":"SACATEPÉQUEZ","municipality":"CIUDAD VIEJA"},{"department":"SACATEPÉQUEZ","municipality":"MAGDALENA MILPAS ALTAS"},{"department":"SACATEPÉQUEZ","municipality":"SAN ANTONIO AGUAS CALIENTES"},{"department":"SACATEPÉQUEZ","municipality":"SAN JUAN ALOTENANGO"},{"department":"SACATEPÉQUEZ","municipality":"SAN MIGUEL DUEÑAS"},{"department":"SACATEPÉQUEZ","municipality":"SANTA CATARINA BARAHONA"},{"department":"SACATEPÉQUEZ","municipality":"SANTA MARIA DE JESUS"},{"department":"SACATEPÉQUEZ","municipality":"JOCOTENANGO"},{"department":"SACATEPÉQUEZ","municipality":"PASTORES"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO"},{"department":"CHIMALTENANGO","municipality":"PARRAMOS"},{"department":"CHIMALTENANGO","municipality":"EL TEJAR"},{"department":"SACATEPÉQUEZ","municipality":"SAN BARTOLOMÉ MILPAS ALTAS"},{"department":"SACATEPÉQUEZ","municipality":"SAN LUCAS SACATEPÉQUEZ"},{"department":"SACATEPÉQUEZ","municipality":"SANTIAGO SACATEPÉQUEZ"},{"department":"SACATEPÉQUEZ","municipality":"SANTO DOMINGO XENACOJ"},{"department":"SACATEPÉQUEZ","municipality":"SANTA LUCIA MILPAS ALTAS"},{"department":"SANTA ROSA","municipality":"BARBERENA"},{"department":"SANTA ROSA","municipality":"CASILLAS"},{"department":"SANTA ROSA","municipality":"CUILAPA"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA"},{"department":"SANTA ROSA","municipality":"ORATORIO"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN"},{"department":"GUATEMALA","municipality":"VILLA CANALES/EL JOCOTILLO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA"},{"department":"SANTA ROSA","municipality":"GUAZACAPAN"},{"department":"SANTA ROSA","municipality":"SAN JUAN TECUACO"},{"department":"SANTA ROSA","municipality":"TAXISCO"},{"department":"JUTIAPA","municipality":"MOYUTA"},{"department":"JUTIAPA","municipality":"PASACO"},{"department":"JUTIAPA","municipality":"CONGUACO"},{"department":"ESCUINTLA","municipality":"MASAGUA"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA"},{"department":"ESCUINTLA","municipality":"ESCUINTLA"},{"department":"ESCUINTLA","municipality":"PALIN"},{"department":"ESCUINTLA","municipality":"SAN VICENTE PACAYA"},{"department":"JUTIAPA","municipality":"JUTIAPA"},{"department":"JUTIAPA","municipality":"COMAPA"},{"department":"JUTIAPA","municipality":"YUPILTEPEQUE"},{"department":"JUTIAPA","municipality":"EL ADELANTO"},{"department":"JUTIAPA","municipality":"ZAPOTITLÁN"},{"department":"JUTIAPA","municipality":"ASUNCIÓN MITA"},{"department":"JUTIAPA","municipality":"EL PROGRESO"},{"department":"JUTIAPA","municipality":"SAN JOSÉ ACATEMPA"},{"department":"JUTIAPA","municipality":"JALPATAGUA"},{"department":"JUTIAPA","municipality":"SANTA CATARINA MITA"},{"department":"JUTIAPA","municipality":"ATESCATEMPA"},{"department":"JUTIAPA","municipality":"AGUA BLANCA"},{"department":"JUTIAPA","municipality":"JEREZ"},{"department":"JUTIAPA","municipality":"QUESADA"},{"department":"ESCUINTLA","municipality":"IZTAPA"},{"department":"ESCUINTLA","municipality":"SAN JOSÉ"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ"},{"department":"GUATEMALA","municipality":"SAN RAYMUNDO"},{"department":"GUATEMALA","municipality":"SAN PEDRO SACATEPÉQUEZ"},{"department":"GUATEMALA","municipality":"CHUARRANCHO"},{"department":"QUICHÉ","municipality":"PACHALUM"},{"department":"BAJA VERAPAZ","municipality":"GRANADOS"},{"department":"BAJA VERAPAZ","municipality":"SANTA CRUZ EL CHOL"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZUMALGUAPA"},{"department":"ESCUINTLA","municipality":"LA DEMOCRACIA"},{"department":"ESCUINTLA","municipality":"SIQUINALA"},{"department":"ESCUINTLA","municipality":"LA GOMERA"},{"department":"ESCUINTLA","municipality":"SIPACATE"},{"department":"SUCHITEPÉQUEZ","municipality":"PATULUL"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JUAN BAUTISTA"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA"},{"department":"ESCUINTLA","municipality":"TIQUISATE"},{"department":"ESCUINTLA","municipality":"COCALES"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO"},{"department":"SOLOLÁ","municipality":"SAN LUCAS TOLIMÁN"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO"},{"department":"QUICHÉ","municipality":"TOTONICAPÁN"},{"department":"QUICHÉ","municipality":"SOLOLÁ"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO"},{"department":"CHIMALTENANGO","municipality":"SAN ANDRÉS ITZAPA"},{"department":"CHIMALTENANGO","municipality":"SANTA CRUZ BALANYA"},{"department":"CHIMALTENANGO","municipality":"ZARAGOZA"},{"department":"QUICHÉ","municipality":"CUNÉN"},{"department":"QUICHÉ","municipality":"JOYABAJ"},{"department":"QUICHÉ","municipality":"ZACUALPA"},{"department":"QUICHÉ","municipality":"COTZAL"},{"department":"QUICHÉ","municipality":"CHAJUL"},{"department":"QUICHÉ","municipality":"NEBAJ"},{"department":"QUICHÉ","municipality":"SACAPULAS"},{"department":"CHIMALTENANGO","municipality":"PATZÚN"},{"department":"CHIMALTENANGO","municipality":"PATZICIA"},{"department":"CHIMALTENANGO","municipality":"ACATENANGO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO"},{"department":"QUICHÉ","municipality":"SAN PEDRO JOCOPILAS"},{"department":"QUICHÉ","municipality":"PATZITE"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE"},{"department":"QUICHÉ","municipality":"CHICHE"},{"department":"QUICHÉ","municipality":"CHINIQUE"},{"department":"QUICHÉ","municipality":"SAN ANDRÉS SAJCABAJA"},{"department":"QUICHÉ","municipality":"SAN JUAN COTZAL"},{"department":"QUICHÉ","municipality":"SAN BARTOLOME JOCOTENANGO"},{"department":"QUICHÉ","municipality":"CANILLA"},{"department":"TOTONICAPÁN","municipality":"SANTA LUCIA LA REFORMA"},{"department":"CHIMALTENANGO","municipality":"SAN JUAN COMALAPA"},{"department":"CHIMALTENANGO","municipality":"SAN MARTÍN JILOTEPEQUE"},{"department":"CHIMALTENANGO","municipality":"TECPÁN"},{"department":"CHIMALTENANGO","municipality":"SAN JOSÉ POAQUIL"},{"department":"CHIMALTENANGO","municipality":"SANTA APOLONIA"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CANTÓN CHUPOL"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CANTÓN CHUGÜEXA"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CANTÓN CHUAMANZANA"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CANTÓN CHUJULIMUL"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CANTÓN AGUA ESCONDIDA"},{"department":"QUICHÉ","municipality":"CHICAMÁN"},{"department":"QUICHÉ","municipality":"USPANTÁN"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA"},{"department":"CHIQUIMULA","municipality":"IPALA"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO"},{"department":"CHIQUIMULA","municipality":"SAN JOSÉ LA ARADA"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA"},{"department":"IZABAL","municipality":"EL ESTOR"},{"department":"IZABAL","municipality":"LIVINGSTON"},{"department":"CHIQUIMULA","municipality":"CONCEPCIÓN LAS MINAS"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS"},{"department":"CHIQUIMULA","municipality":"OLOPA"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE"},{"department":"EL PROGRESO","municipality":"GUASTATOYA"},{"department":"EL PROGRESO","municipality":"MORAZÁN"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN"},{"department":"EL PROGRESO","municipality":"SAN CRISTÓBAL ACASAGUASTLAN"},{"department":"EL PROGRESO","municipality":"EL JICARO"},{"department":"JALAPA","municipality":"*SAN PEDRO PINULA*"},{"department":"JALAPA","municipality":"JALAPA"},{"department":"JALAPA","municipality":"*SAN LUIS JILOTEPEQUE*"},{"department":"JALAPA","municipality":"MONJAS"},{"department":"JALAPA","municipality":"*SAN CARLOS ALZATATE*"},{"department":"JALAPA","municipality":"*SAN MANUEL CHAPARRÓN*"},{"department":"IZABAL","municipality":"MORALES"},{"department":"IZABAL","municipality":"LOS AMATES"},{"department":"IZABAL","municipality":"PUERTO BARRIOS"},{"department":"EL PROGRESO","municipality":"SANARATE"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ"},{"department":"EL PROGRESO","municipality":"SANSARE"},{"department":"ZACAPA","municipality":"TECULUTÁN"},{"department":"ZACAPA","municipality":"USUMATLÁN"},{"department":"ZACAPA","municipality":"SAN DIEGO"},{"department":"ZACAPA","municipality":"CABAÑAS"},{"department":"ZACAPA","municipality":"HUITE"},{"department":"ZACAPA","municipality":"RÍO HONDO"},{"department":"ZACAPA","municipality":"GUALÁN"},{"department":"ZACAPA","municipality":"ZACAPA"},{"department":"ZACAPA","municipality":"ESTANZUELA"},{"department":"ZACAPA","municipality":"LA UNIÓN"},{"department":"ZACAPA","municipality":"SAN JORGE"},{"department":"SAN MARCOS","municipality":"OCOS"},{"department":"SAN MARCOS","municipality":"TECÚN UMÁN AYUTLA"},{"department":"SAN MARCOS","municipality":"AYUTLÁ"},{"department":"SAN MARCOS","municipality":"PAJAPITA"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR"},{"department":"QUETZALTENANGO","municipality":"COATEPEQUE"},{"department":"QUETZALTENANGO","municipality":"GÉNOVA"},{"department":"QUETZALTENANGO","municipality":"FLORES COSTA CUCA"},{"department":"QUETZALTENANGO","municipality":"COLOMBA COSTA CUCA"},{"department":"SAN MARCOS","municipality":"EL QUETZAL"},{"department":"SAN MARCOS","municipality":"LA REFORMA"},{"department":"SAN MARCOS","municipality":"NUEVO PROGRESO"},{"department":"SAN MARCOS","municipality":"LA BLANCA"},{"department":"RETALHULEU","municipality":"LOCALIDAD VALLE LIRIO"},{"department":"RETALHULEU","municipality":"LOCALIDAD EL ASINTAL"},{"department":"RETALHULEU","municipality":"LOCALIDAD CABALLO BLANCO"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"ALDEA PACAMACHE"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"ALDEA XOJOLA"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"CASERIO CHICOCAB"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"CHUACHINUP"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"CHUAMANGO"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"CHUISANTO TOMAS"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"PACANAL"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"PAJOCA"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"PASAC"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"PASAJQUIM"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"PATZITE"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"PATZULIN"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"POCHOL O CHUISTO TOMAS LA UNION"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"SAJQUIM"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"TZAMABAJ"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"TZANJUYUP"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"XEABAJ"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"XEJUYUB"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"XEXAC"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"YOXAJA"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"ZONA 1"},{"department":"SOLOLÁ","municipality":"NAHUALÁ / BOCACOSTA","town":"CASERIO CHUIDOLORES"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"CHUINIMA"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"CHUISAJCABA"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"GUINEALES"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"PACAMACHE"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"PACAMAN O PACULAM"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"PANGUINEY"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"PASIN"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"PATZITE"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"TZAMCHAJ"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"XOLJUYUP"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATÁN","town":"ZONA 1"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO TOMAS LA UNIÓN","town":"CAMACHE CHIQUITO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO TOMAS LA UNIÓN","town":"CAMACHE GRANDE"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO TOMAS LA UNIÓN","town":"CANTON MAZA"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO TOMAS LA UNIÓN","town":"ZONA 1"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN BERNARDINO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN LORENZO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN MIGUEL PANÁN"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ EL ÍDOLO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN ANTONIO SUCHITEPÉQUEZ"},{"department":"SUCHITEPÉQUEZ","municipality":"SAMAYAC"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN GABRIEL"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO"},{"department":"SUCHITEPÉQUEZ","municipality":"ZUNILITO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN PABLO JOCOPILAS"},{"department":"SUCHITEPÉQUEZ","municipality":"PUEBLO NUEVO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ LA MÁQUINA"},{"department":"SUCHITEPÉQUEZ","municipality":"CUYOTENANGO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN FRANCISCO ZAPOTITLÁN"},{"department":"RETALHULEU","municipality":"SAN ANDRES VILLA SECA"},{"department":"QUETZALTENANGO","municipality":"ALMOLONGA"},{"department":"QUETZALTENANGO","municipality":"CABRICAN"},{"department":"QUETZALTENANGO","municipality":"LA ESPERANZA"},{"department":"QUETZALTENANGO","municipality":"CAJOLÁ"},{"department":"QUETZALTENANGO","municipality":"QUETZALTENANGO"},{"department":"QUETZALTENANGO","municipality":"SAN JUAN OSTUNCALCO"},{"department":"QUETZALTENANGO","municipality":"SAN MATEO"},{"department":"QUETZALTENANGO","municipality":"CANTEL"},{"department":"QUETZALTENANGO","municipality":"SAN MARTIN SACATEPEQUEZ"},{"department":"QUETZALTENANGO","municipality":"ZUNIL"},{"department":"QUETZALTENANGO","municipality":"CONCEPCIÓN CHIQUIRICHAPA"},{"department":"QUETZALTENANGO","municipality":"HUITAN"},{"department":"QUETZALTENANGO","municipality":"PALESTINA DE LOS ALTOS"},{"department":"QUETZALTENANGO","municipality":"SAN CARLOS SIJA"},{"department":"QUETZALTENANGO","municipality":"SIBILIA"},{"department":"QUETZALTENANGO","municipality":"SALCAJA"},{"department":"QUETZALTENANGO","municipality":"SAN FRANCISCO LA UNIÓN"},{"department":"QUETZALTENANGO","municipality":"SAN JUAN OLINTEPEQUE"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS"},{"department":"RETALHULEU","municipality":"EL ASINTAL"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA"},{"department":"RETALHULEU","municipality":"SAN MARTIN ZAPOTITLÁN"},{"department":"RETALHULEU","municipality":"RETALHULEU"},{"department":"RETALHULEU","municipality":"CHAMPERICO"},{"department":"RETALHULEU","municipality":"SAN SEBASTIÁN"},{"department":"RETALHULEU","municipality":"SAN FELIPE"},{"department":"RETALHULEU","municipality":"LA ASINTAL"},{"department":"QUETZALTENANGO","municipality":"NUEVO PALMAR"},{"department":"QUETZALTENANGO","municipality":"EL PALMAR"},{"department":"SOLOLÁ","municipality":"PATULUL"},{"department":"SOLOLÁ","municipality":"SAN JUAN LAGUNA"},{"department":"SOLOLÁ","municipality":"SAN MARCOS LAGUNA"},{"department":"SOLOLÁ","municipality":"SAN PABLO LAGUNA"},{"department":"SOLOLÁ","municipality":"SAN PEDRO LAGUNA"},{"department":"SOLOLÁ","municipality":"SANTA CRUZ LAGUNA"},{"department":"SOLOLÁ","municipality":"SANTIAGO ATITLÁN"},{"department":"SOLOLÁ","municipality":"SAN JOSÉ CHACAYA"},{"department":"SOLOLÁ","municipality":"CONCEPCION"},{"department":"SOLOLÁ","municipality":"SAN ANTONIO PALOPO"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA PALOPO"},{"department":"SOLOLÁ","municipality":"NAHUALÁ"},{"department":"SOLOLÁ","municipality":"SAN ANDRÉS SEMETABAJ"},{"department":"SOLOLÁ","municipality":"PANAJACHEL"},{"department":"SOLOLÁ","municipality":"SANTA MARIA VISITACION"},{"department":"SOLOLÁ","municipality":"SANTA LUCIA UTATLÁN"},{"department":"SOLOLÁ","municipality":"SOLOLÁ"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTLAHUACÁN"},{"department":"SOLOLÁ","municipality":"SANTA CRUZ LA LAGUNA"},{"department":"SOLOLÁ","municipality":"SANTA CLARA LA LAGUNA"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CANTÓN CHUIMANZANA"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CHICUA I"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CHICUA II"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CAMANCHAJ I"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CAMANCHAJ II"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CHUABAJ"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"ALDEA LA ESPERANZA"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"ALDEA LA CONCORDIA"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"ALDEA BARRANECHE"},{"department":"TOTONICAPÁN","municipality":"MOMOSTENANGO"},{"department":"TOTONICAPÁN","municipality":"SAN ANDRÉS XECUL"},{"department":"TOTONICAPÁN","municipality":"SAN CRISTÓBAL TOTONICAPÁN"},{"department":"TOTONICAPÁN","municipality":"SAN FRANCISCO EL ALTO"},{"department":"TOTONICAPÁN","municipality":"SANTA MARIA CHIQUIMULA"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN"},{"department":"TOTONICAPÁN","municipality":"SAN BARTOLO"},{"department":"ALTA VERAPAZ","municipality":"SANTA MARIA CAHABÓN"},{"department":"ALTA VERAPAZ","municipality":"LANQUÍN"},{"department":"ALTA VERAPAZ","municipality":"CHAHAL"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA"},{"department":"ALTA VERAPAZ","municipality":"CHISEC","town":"CANLECH"},{"department":"ALTA VERAPAZ","municipality":"CHISEC","town":"LINTERNA 1"},{"department":"ALTA VERAPAZ","municipality":"CHISEC","town":"LINTERNA 2"},{"department":"ALTA VERAPAZ","municipality":"CHISEC","town":"CRUCE DEL PATO"},{"department":"ALTA VERAPAZ","municipality":"CHISEC","town":"TZULUL QEQCHI"},{"department":"ALTA VERAPAZ","municipality":"COBÁN"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOME DE LAS CASAS"},{"department":"ALTA VERAPAZ","municipality":"RAXRUHA"},{"department":"ALTA VERAPAZ","municipality":"SAN MIGUEL TUCURU"},{"department":"ALTA VERAPAZ","municipality":"SANTA CATARINA LA TINTA"},{"department":"ALTA VERAPAZ","municipality":"TAMAHU"},{"department":"ALTA VERAPAZ","municipality":"SENAHU"},{"department":"QUICHÉ","municipality":"PLAYA GRANDE, IXCÁN"},{"department":"BAJA VERAPAZ","municipality":"RABINAL"},{"department":"BAJA VERAPAZ","municipality":"CUBULCO"},{"department":"ALTA VERAPAZ","municipality":"CHISEC"},{"department":"BAJA VERAPAZ","municipality":"SAN MIGUEL CHICAJ"},{"department":"BAJA VERAPAZ","municipality":"SALAMÁ"},{"department":"BAJA VERAPAZ","municipality":"SAN JERONIMO"},{"department":"BAJA VERAPAZ","municipality":"PURUHÁ"},{"department":"ALTA VERAPAZ","municipality":"SAN CRISTÓBAL VERAPAZ"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ"},{"department":"ALTA VERAPAZ","municipality":"TACTIC"},{"department":"PETÉN","municipality":"EL CHAL"},{"department":"PETÉN","municipality":"SANTA ANA"},{"department":"PETÉN","municipality":"DOLORES"},{"department":"PETÉN","municipality":"MELCHOR DE MENCOS"},{"department":"PETÉN","municipality":"LA LIBERTAD"},{"department":"PETÉN","municipality":"SAN FRANCISCO"},{"department":"PETÉN","municipality":"RETALTECO"},{"department":"PETÉN","municipality":"BETHEL"},{"department":"PETÉN","municipality":"LAS CRUCES"},{"department":"PETÉN","municipality":"EL SUBIN"},{"department":"PETÉN","municipality":"MELCHOR"},{"department":"PETÉN","municipality":"POPTUN"},{"department":"PETÉN","municipality":"SAN LUIS"},{"department":"PETÉN","municipality":"SAN BENITO"},{"department":"PETÉN","municipality":"SAN ANDRÉS"},{"department":"PETÉN","municipality":"SAN JOSÉ"},{"department":"PETÉN","municipality":"SANTA ELENA"},{"department":"PETÉN","municipality":"FLORES"},{"department":"PETÉN","municipality":"SAYAXCHE"},{"department":"HUEHUETENANGO","municipality":"AGUACATÁN"},{"department":"HUEHUETENANGO","municipality":"SAN MATEO IXTATAN"},{"department":"HUEHUETENANGO","municipality":"SANTA CRUZ BARILLAS"},{"department":"HUEHUETENANGO","municipality":"CAMOJÁ"},{"department":"HUEHUETENANGO","municipality":"SANTIAGO CHIMALTENANGO"},{"department":"HUEHUETENANGO","municipality":"CUILCO"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA"},{"department":"HUEHUETENANGO","municipality":"LA LIBERTAD"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO NECTA"},{"department":"HUEHUETENANGO","municipality":"SAN ILDEFONSO IXTAHUACÁN"},{"department":"HUEHUETENANGO","municipality":"COLOTENANGO"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO"},{"department":"HUEHUETENANGO","municipality":"MALACATANCITO"},{"department":"HUEHUETENANGO","municipality":"SAN GASPAR IXCHIL"},{"department":"HUEHUETENANGO","municipality":"SAN JUAN ATITÁN"},{"department":"HUEHUETENANGO","municipality":"SAN RAFAEL PETZAL"},{"department":"HUEHUETENANGO","municipality":"SAN SEBASTIÁN HUEHUETENANGO"},{"department":"HUEHUETENANGO","municipality":"SANTA BARBARA"},{"department":"SAN MARCOS","municipality":"SIPACAPA"},{"department":"SAN MARCOS","municipality":"SAN PABLO"},{"department":"SAN MARCOS","municipality":"MALACATÁN"},{"department":"SAN MARCOS","municipality":"SAN JOSÉ EL RODEO"},{"department":"SAN MARCOS","municipality":"CATARINA"},{"department":"HUEHUETENANGO","municipality":"CHIANTLA"},{"department":"HUEHUETENANGO","municipality":"TODOS SANTOS CUCHUMATAN"},{"department":"HUEHUETENANGO","municipality":"CONCEPCION HUISTA"},{"department":"HUEHUETENANGO","municipality":"JACALTENANGO"},{"department":"HUEHUETENANGO","municipality":"NENTON"},{"department":"HUEHUETENANGO","municipality":"PETATAN"},{"department":"HUEHUETENANGO","municipality":"SAN ANTONIO HUISTA"},{"department":"HUEHUETENANGO","municipality":"SAN MIGUEL IXTAHUACÁN"},{"department":"HUEHUETENANGO","municipality":"SANTA ANA HUISTA"},{"department":"HUEHUETENANGO","municipality":"SAN MIGUEL ACATAN"},{"department":"HUEHUETENANGO","municipality":"UNION CANTINIL"},{"department":"SAN MARCOS","municipality":"SAN LORENZO"},{"department":"SAN MARCOS","municipality":"SAN PEDRO SACATEPEQUEZ"},{"department":"SAN MARCOS","municipality":"SAN ANTONIO SACATEPEQUEZ"},{"department":"SAN MARCOS","municipality":"SAN CRISTOBAL CUCHO"},{"department":"SAN MARCOS","municipality":"ESQUIPULAS PALO GORDO"},{"department":"SAN MARCOS","municipality":"SAN MARCOS"},{"department":"SAN MARCOS","municipality":"RÍO BLANCO"},{"department":"QUETZALTENANGO","municipality":"PALESTINA"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA"},{"department":"SAN MARCOS","municipality":"EL RODEO"},{"department":"HUEHUETENANGO","municipality":"SAN JUAN IXCOY"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMA"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA"},{"department":"HUEHUETENANGO","municipality":"SAN RAFEEL INDEPENDENCIA"},{"department":"HUEHUETENANGO","municipality":"SAN SEBASTIAN COATAN"},{"department":"SAN MARCOS","municipality":"TAJUMULCO"},{"department":"SAN MARCOS","municipality":"TACANÁ"},{"department":"SAN MARCOS","municipality":"SIBINAL"},{"department":"SAN MARCOS","municipality":"COMITANCILLO"},{"department":"SAN MARCOS","municipality":"CONCEPCION TUTUAPA"},{"department":"SAN MARCOS","municipality":"SAN MIGUEL IXTAHUACÁN"},{"department":"SAN MARCOS","municipality":"SAN SEBASTIÁN"},{"department":"GUATEMALA","municipality":"SAN JOSÉ DEL GOLFO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC"},{"department":"GUATEMALA","municipality":"CHINAUTLA"},{"department":"GUATEMALA","municipality":"MIXCO"},{"department":"GUATEMALA","municipality":"GUATEMALA"},{"department":"GUATEMALA","municipality":"PALENCIA"},{"department":"GUATEMALA","municipality":"SAN JOSÉ PINULA"},{"department":"GUATEMALA","municipality":"SANTA CATARINA PINULA"},{"department":"GUATEMALA","municipality":"VILLA NUEVA"},{"department":"GUATEMALA","municipality":"SAN MIGUEL PETAPA"},{"department":"GUATEMALA","municipality":"FRAIJANES"},{"department":"GUATEMALA","municipality":"VILLA CANALES"},{"department":"GUATEMALA","municipality":"AMATITLÁN"}],"bda":[{"department":"SACATEPÉQUEZ","municipality":"JOCOTENANGO","town":"VISTA HERMOSA","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"JOCOTENANGO","town":"ALTA LOMA","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"SAN JUAN ALOTENANGO","town":"LA EMINENCIA CANTON 2","bda":"HABILITADO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"REJON 1","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"REJON2","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"SAN RAFAEL EL ARADO","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"SANTA MARTA","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"SAN JOSÉ EL YALU","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"ALDEA SANTA MARTA","bda":"HABILITADO AM"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"ALDEA SAN RAFAEL EL ARADO","bda":"HABILITADO AM"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"LAS FLORES","bda":"BLOQUEADO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"SUMPANGO","bda":"HABILITADO SOLO CASCO URBANO"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"SUMPANGO","bda":"BLOQUEADO TODAS LAS ALDEAS ALEDAÑAS AL CASCO URBANO"},{"department":"SACATEPÉQUEZ","municipality":"SANTA MARIA DE JESUS","town":"SANTA MARIA DE JESUS","bda":"BLOQUEADO / POR PELIGROSIDAD CONSTANTES ASALTOS A PERSONAL DE BDA"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"LA COLINA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL COLORADO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL HATO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL LLANO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL RASTRO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"SAN JORGE 1","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"SAN JORGE 2","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"SAN JORGE 3","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"CANOGUITAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL PLATANAR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"MAL PAÍS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"CAMINO CERRO REDONDO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"SABANETAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"LOS HORNITOS","bda":"HABILITADO SOLO CALLE PRINCIPAL HORARIO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"LAS ESTRELLAS 1","bda":"HABILITADO HORARIO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"LAS ESTRELLAS 2","bda":"HABILITADO HORARIO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"CANTON QUEBRADA LA GALERA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"COL SAN ANTONIO","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL TALPETATE","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"LOS BIJAGUES","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"BUENA VISTA","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL JUNQUILLO","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"EL QUEBRACHO","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"SAN JUAN DE ARANA","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"MONTECILLOS","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"MONTERROSO AL FONDO","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"SECTOR EL CAMPO","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"BARRIO EL CERRITO","bda":"BLOQUEADO PARTE ALTA DE BARRIO EL CERRITO"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"COLONIA SAN ANTONIO","bda":"HABILITADO HORARIO AM"},{"department":"SANTA ROSA","municipality":"BARBERENA","town":"FINCA SABANETAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"BUENA VISTA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"EL IZOTE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"PORTEZUELO","bda":"BLOQUEADO (SOLO SE ATIENDE CLIENTES Y EX CLIENTES RECURRENTES)"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA LAS MARIAS","bda":"BLOQUEADO (SOLO SE ATIENDE CLIENTES Y EX CLIENTES RECURRENTES)"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"PLAN GRANDE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"PINOS ALTOS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"CORRALITOS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"VOLCANCITOS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"BEJUCAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"SAN JUAN TALPETATE","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA AYARZA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA LAS MARIAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA LAS ILUSIONES","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA LA ESPERANZA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA CERRO DE DON LEON","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA MONTE VERDE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA EL DURAZNO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA LAS NUECES","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA TAPALAPA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA CORRALITOS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA SAN MIGUEL RINCON","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA LLANO GRANDE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA EL LLANITO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA LA CUEVA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA EL IZOTE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"ALDEA SAN IGNACIO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"GUACAMAYITAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"GUACAMAYAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"PUERTA ROJA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"SAN JOSÉ EL ROSARIO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"LOS ESCLAVOS","bda":"HABILITADO CENTRO Y CARRETERA INTERAMERICANA HORARIO AM"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"VILLA LAURA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"MATOCHOS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"EL RODEO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"AGUA ZARCA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"LA 46","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"LOS CHILITOS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"CANTONES ALEDAÑOS A LOS ESCLAVOS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"ALDEA ESCLAVOS SECTOR CEMENTERIO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"ALDEA LAS MONJAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CUILAPA","town":"CUILAPILLA","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA GUADALUPE","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, SANTA ANA LA MONTAÑA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, EL LIMAR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, JOYA GRANDE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, LAS JOYAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, ZACUAPA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, GUACAMAYAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, GUACAMAYITAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, EL CEDRO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"ALDEA, CANTÓN, BARRIO, SAN ANTONIO BUENA VISTA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"LOMAS DE OJO DE AGUA","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"LOS IZOTES","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"NUEVA SANTA ROSA","town":"JUMAYTEPEQUE","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"EL CITIO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"EL GUAYABO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"EL MELCHOR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"LA CEIBILLA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"EL CACAO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"LA PASTORIA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"LA CANOA","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"COATEPEQUE","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"ORATORIO","town":"LA VIRGEN","bda":"BLOQUEADO (HORARIO AM, SOLO SE ATIENDE CLIENTES Y EX CLIENTES RECURRENTES)"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"EL PESCADOR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"JOYA DE SAN NICOLÁS","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"EL MORA","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"CERRO TECUAMBURRO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"ALDEA IXPACO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"ALDEA LA GAVITA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"ALDEA EL MADRIADO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"ALDEA POTRERIOS","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"PUEBLO NUEVO VIÑAS","town":"BARRIO SAN JUAN","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES","town":"SAN RAFAELITO","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES","town":"EL CARMEN","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES","town":"EL CHAN","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES","town":"EL CHANITO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES","town":"ALDEA LA VEGA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES","town":"ALDEA EL CHANON","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SAN RAFAEL LAS FLORES","town":"ALDEA MEDIA CUESTA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"FINCA EL SARZAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"EL MATOCHO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"LLANO DE LA CRUZ","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"TEOCINTE","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"POTRERILLOS","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"EL SAUCE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"ALDEA EL CARMEN","bda":"HABILITADO AM"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"EL MORRO 1","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA CRUZ NARANJO","town":"EL MORRO 2","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"CERRO GORDO","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"LA CASITA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"LA BREA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"SABANETAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"PARRAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"EL CHOCOLATE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"LAS FLORES","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"BELEN","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"TASAJERA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"ALDEA PUEBLO VIEJO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"ALDEA EL CARRIZAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"ALDEA LA BREA","bda":"HABILITADO HORARIO AM PARA CLIENTES RECURRENTES Y EX CLIENTES."},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"ALDEA PARRAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA LO LIMA","town":"COLONIA SAN GERMAN","bda":"HABILITADO HORARIO AM"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"ALDEA LAS BOLSAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"ALDEA LAS BOLSITAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA ROSA DE LIMA","town":"ALDEA EL TESORO","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ESTANZUELA","bda":"HABILITADO, SOLO ÁREA CÉNTRICA NO CANTONES HORARIO AM"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ALDEA EL SARZAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ALDEA EL COROSAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ALDEA LA GLORIA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ALDEA EL PITAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ALDEA EL PLATANAR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ALDEA MEDIA LEGUA","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"SANTA MARIA IXHUATÁN","town":"ALDEA SAN ANTONIO","bda":"HABILITADO HORARIO AM"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"SINACANTAN","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"AROCHE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"OJO DE AGUA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"TIERRA BLANCA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"CASERIO INJERTO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"CHANLAPA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"PEJE ARMADO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"BUENOS AIRES","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"COROZAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"ALDEA EL ZAPOTE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"SANTA MARIA IXHUATÁN SAN JUAN TECUACO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"ALDEA PINZÓN","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"ALDEA GIBRALTAR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"LAS LISAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"CASAS VIEJAS","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"CASERIO LAS MARIAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"ALDEA LAS ESCOBAS","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"ALDEA MIRAMAR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"EL CAMPAMENTO","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"CHIQUIMULILLA","town":"LLANO GRANDE","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"ALDEA EL PANAL","bda":"HORARIO AM"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"LAS VIOLETAS DEL JOBO","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"CASERIO DON DIEGO PEJE ARMADO.","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"EL PAPAYO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"ALDEA EL PANAL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"EL CIRCULAR","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"ALCARAVANES","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"DON DIEGO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"EL DESENGAÑO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"TEPEACO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"FINCA SANTA LUISA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"FINCA ALTAMIRA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"FINCA LA CANASTA","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"TAXISCO","town":"EL GÜISCOYOL","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"GUAZACAPAN","town":"POZA DE AGUA","bda":"HABILITADO"},{"department":"SANTA ROSA","municipality":"GUAZACAPAN","town":"PALO ALTO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"TINTON NORTE","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"TINTON SUR","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"SAN PEDRO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"LAS PILAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"LA GRANADILLA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"PALO BLANCO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"CERRO GORDO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"TERRONES","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"LAGUNA DEL MUERTO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"PLATANILLOS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"EL GIGANTE","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"EL COLORADO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"EL FRANCO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"EL FRANQUITO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"BUENOS AIRES","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"LAS FILITAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"SAN FRANCISCO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"CONGUACO","town":"EL BARRO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"BETANIA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"LA CAÑADA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"BUENA VISTA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"SAN CAYETANO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"EL PINITO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"PINO SANTA CRUZ","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"SAN ANDRÉS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"LAS CHAMPAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"CASERIO LA SORPRESA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"EL CHAGÜITE","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"LAS HILAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"LA HILITAS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"PALMERAS DEL NORTE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"ASENTAMIENTO/COLONIA LA PAZ","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"PRADOS DEL CARMEN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"COLONIA LA OPORTUNIDAD","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"QUINTAS BELLO HORIZONTES","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"COL. EL CARMEN","bda":"HABILITADO EN HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"POPULAR ENTRE RÍOS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"ESFUERZO 1 Y 2","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"LOS NARANJALES","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"SICILIA 2","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"PALMERAS DEL SUR","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"PALMERAS DEL SUR","bda":"BLOQUEADO CASAS SOBRE LÍNEA FÉRREA"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"GUADALUPE FINCA EL ZAPOTE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"FLORIDO ACEITUNO","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"COLONIA FERROCARRILERA","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"PRADOS SAN JORGE","bda":"Bloqueado parcial (habilitado boulevard principal hasta 10a. Calle, horario AM, sin ingresar a callejones)"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"COLONIA SAN FELIPE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"SANTA CLARA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"AGUA BLANCA","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"MARSELLA","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"GUATELINDA","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"AVENIDA FERROCARRIL","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"SAN NICOLÁS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"NUEVO MÉXICO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"NUEVO MÉXICO","bda":"BLOQUEADO FINCAS Y ALDEAS ALEDAÑAS"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"ALDEA EL RODEO","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"SAN MIGUEL LOS LOTES","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"FINCA SAN LUIS URRUELA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"LA ESTANCIA","bda":"HABILITADO EN HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"ALDEA LAS CHAPERNAS","bda":"HABILITADO EN HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"CASCADA 2","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"ALDEA SAN ANDRÉS OSUNA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"ALDEA CEYLAN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"COMUNIDAD CEYLAN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"VILLAS DEL CARMEN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA","town":"SILLÓN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA","town":"EL PORVENIR","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA","town":"SAN ANTONIO BUENA VISTA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA","town":"ALDEA EL BRITO","bda":"BLOQUEO PARCIAL (Habilitado calle principal, sin ingresar a callejones (Horario AM))"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA","town":"EL PARAJE GALÁN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA","town":"ALDEA EL TARRAL","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"GUANAGAZAPA","town":"ALDEA PARAJE GALAN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"EL ASTILLERO","bda":"Habilitado calle principal (solo horario AM)"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"SAN MIGUEL LAS FLORES","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"EL JUTE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"LÍNEA 7 Y 8 CUYUTA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"COLONIA / ALDEA EL MILAGRO","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"ALDEA LINARES","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"OBERO","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"BUENA FE","bda":"HABILITADO EN HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"ESCUINTLA","municipality":"SAN VICENTE PACAYA","town":"BEJUCAL","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SAN VICENTE PACAYA","town":"LA FERROCARRILERA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"PALÍN","town":"LA PERIQUERA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"PALÍN","town":"MARIA MATOS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"CASCADA 1","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"CASCADA 3","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"SAN CARLOS CANADÁ","bda":"HABILITADO EN HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"ESCUINTLA","municipality":"ESCUINTLA","town":"SAN GABRIEL","bda":"HABILITADO EN HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"JUTIAPA","municipality":"ATESCATEMPA","town":"EL NARANJO","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"ATESCATEMPA","town":"HORCONES","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"COMAPA","town":"CARRIZO","bda":"HORARIO AM"},{"department":"JUTIAPA","municipality":"COMAPA","town":"LOS JIMENEZ","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"COMAPA","town":"EL JOCOTE","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"COMAPA","town":"IXCANAL 1","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"COMAPA","town":"IXCANAL 2","bda":"HORARIO AM"},{"department":"JUTIAPA","municipality":"COMAPA","town":"ANONITO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"COMAPA","town":"APANTEN","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"IXTACAPA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ANIMAS LOMAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"VELAZQUEZ","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA POTRERO GRANDE","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA EL COYOL","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA CHINAMAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA ARRAYANAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA EL CUJE LAS PILAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"YUPILTEPEQUE","town":"ALDEA EL LLANO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA LA VEGA AL RUTA 23","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA EL MARILLO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA EL DURAZNO","bda":"HABILITADO HASTA LAS 2:00 PM"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA VALENCIA","bda":"HABILITADO HASTA LAS 2:00 PM"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"ALDEA LA CEBITA","bda":"HABILITADO HASTA LAS 2:00 PM"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"LA PEÑA","bda":"HABILITADO HASTA LAS 2:00 PM"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"MARIAS MONTAÑAS","bda":"HABILITADO HASTA LAS 2:00 PM"},{"department":"JUTIAPA","municipality":"JUTIAPA","town":"CASERIO LAGUNILLA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"QUEZADA","town":"SAN FERNANDO","bda":"HABILITADO SOLO CENTRO"},{"department":"JUTIAPA","municipality":"SAN JOSÉ ACATEMPA","town":"LLANO GRANDE","bda":"HABILITADO SOLO CENTRO"},{"department":"JUTIAPA","municipality":"SAN JOSÉ ACATEMPA","town":"TUNILLAS","bda":"HABILITADO SOLO CENTRO"},{"department":"JUTIAPA","municipality":"SAN JOSÉ ACATEMPA","town":"EL CARPINTERO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"SANTA CATARINA MITA","town":"SANTA ROSITA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"SANTA CATARINA MITA","town":"LOS ZORRILLOS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"SANTA CATARINA MITA","town":"ZACUAPA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"YUPILTEPEQUE","town":"LA PERLA RUTA 23","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"YUPILTEPEQUE","town":"PUEBLO VIEJO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"ZAPOTITLÁN","town":"LA CEIBITA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"ZAPOTITLÁN","town":"PAPATURRO","bda":"BLOQUEADO"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"AYARZA","bda":"HABILITADO HASTA LAS 2:00 PM"},{"department":"SANTA ROSA","municipality":"CASILLAS","town":"CRUZITAS","bda":"HABILITADO HASTA LAS 2:00 PM"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"EL QUEQUESQUE","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"BETHANIA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"SAN ISIDRO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"EL NANZAL","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"SAN ANDES","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"LAS LOMAS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"EL SACAMIL","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"BARRANCA HONDA","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"SAN ANTONIO MIRAMAR","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"MOYUTA","town":"PALOS ABRAZADOS","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"JALPATAGUA","town":"EL MARILLO","bda":"BLOQUEADO"},{"department":"JUTIAPA","municipality":"ATESCATEMPA","town":"ALDEA SAN CRISTÓBAL FRONTERA","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"ATESCATEMPA","town":"ATESCATEMPA","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"ATESCATEMPA","town":"ALDEA CONTEPEQUE","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"JEREZ","town":"ALDEA ESMERALDA","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"JEREZ","town":"JEREZ","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"ASUNCIÓN MITA","town":"ALDEA VALLE NUEVO","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"ASUNCIÓN MITA","town":"ALDEA LOS AMATES","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"ASUNCIÓN MITA","town":"ALDEA SAN MIGUELITO","bda":"HABILITADO"},{"department":"JUTIAPA","municipality":"ASUNCIÓN MITA","town":"ALDEA SAN RAFAEL","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"MASAGUA","town":"BARRIO EL LIMON","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"PUERTO SAN JOSÉ","town":"NAZARETH","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"PUERTO SAN JOSÉ","town":"CASCADA 1","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"PUERTO SAN JOSÉ","town":"CASCADA 3","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"PUERTO SAN JOSÉ","town":"ALDEA LA GUARDIANÍA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"PUERTO SAN JOSÉ","town":"14 DE FEBRERO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"PUERTO SAN JOSÉ","town":"COLONIA ARÉVALO","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"PUERTO SAN JOSÉ","town":"COLONIA LA ARENERA","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ","town":"LAS MARGARITAS V","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ","town":"LAS MARGARITAS VI","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ","town":"LAS VISTAS","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ","town":"SAN JUAN PANORAMA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ","town":"CIUDAD GÓTICA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ","town":"LA LADRILLERA LO DE CARRANZA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN JUAN SACATEPÉQUEZ","town":"LINDA VISTA 3","bda":"SOLO CALLES PRINCIPALES NO APLICAN CALLEJONES"},{"department":"SACATEPÉQUEZ","municipality":"SUMPANGO","town":"ALDEA REGALITO DE DIOS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"LA DEMOCRACIA","town":"COLONIA LA PROMESA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"LA DEMOCRACIA","town":"CUNCUN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"LA DEMOCRACIA","town":"LAS DELICIAS","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"LA DEMOCRACIA","town":"VELASQUITOS","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"LA DEMOCRACIA","town":"FINCA VELASQUEZ","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"CIPRECITOS","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"LOS CHATOS","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"EL CONGO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"EL TERRERO","bda":"HABILITADO SOLO CASCO URBANO EN HORARIO AM"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"LA PROSPERIDAD","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"PARCELAMIENTO EL SILENCIO","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"PARCELAMIENTO LAS CRUCES","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"LA GOMERA","town":"CERRO COLORADO","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"ALDEA XAYA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"CARRIZALES","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"EL CAJÓN","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"SAN JUDAS","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"LA BOLSA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"8 DE FEBRERO","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"LA ESTACION","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"LOTIFICACIÓN EL TRIUNFO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"GETSEMANÍ","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"NUEVO AMANECER","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"FINCA LAS MORENAS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"SECTOR AGÜERO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"BETHANIA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"LA CUARENTA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"EL BARCO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"LA BUGA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCIA COTZ","town":"ALAMEDAS","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SIQUINALA","town":"LAS PALMAS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SIQUINALA","town":"EL NÍSPERO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SIQUINALA","town":"LUCERNA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SIQUINALA","town":"LA LADRILLERA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SIPACATE","town":"SIPACATE CABECERA MUNICIPAL","bda":"HABILITADO PLAYA LA EMPALIZADA, NO APLICAN AREAS QUE SE DEBA CRUZAR EN LANCHA O FERRI."},{"department":"ESCUINTLA","municipality":"SIPACATE","town":"SIPACATE","bda":"HABILITADO EL PAREDÓN, NO APLICAN AREAS QUE SE DEBA CRUZAR EN LANCHA O FERRI."},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"CANTON QUISACHÉ","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"SANTA LUCÍA COTZUMALGUAPA","town":"BUENOS AIRES","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCÍA COTZUMALGUAPA","town":"SAN PEDRITO","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCÍA COTZUMALGUAPA","town":"EL PALMAR 1","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCÍA COTZUMALGUAPA","town":"EL PALMAR 2","bda":"HABILITADO AM"},{"department":"ESCUINTLA","municipality":"SANTA LUCÍA COTZUMALGUAPA","town":"LAS JOYAS","bda":"HABILITADO AM"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"SAN PEDRO YEPOCAPA","bda":"HABILITADO AM"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"MONTELLANO","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"LA CRUZ","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"SANTA SOFIA","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"EL PORVENIR","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"PANIMICHÉ","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"SAN RAFAEL SUMATAN","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"CASERÍOS DE INGENIO PANTALEON","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"ESTRELLITA","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"MORELIA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"PATULUL","town":"COLONIA LAS MARIAS","bda":"HABILITADO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"PATULUL","town":"ALDEA SANTA LUISIANA","bda":"HABILITADO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"PATULUL","town":"COLONIA LA ESPERANZA 1","bda":"HABILITADO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"PATULUL","town":"COLONIA LA ESPERANZA 2","bda":"HABILITADO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"PATULUL","town":"FINCA SAN JULIÁN","bda":"HABILITADO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"EL ESFUERZO","bda":"HABILITADO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"ALDEA LAS ILUSIONES","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"ALDEA GUAYABAL","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"ALDEA EL TESORO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"FINCA MOCA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"ALDEA SANTA ADELAIDA","bda":"HABILITADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"ALDEA ZONA MIRAMAR","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"ALDEA SANTA ISABEL","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"ALDEA SAN JUAN LAS MARGARITAS","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BARBARA","town":"CINCO DE ABRIL","bda":"HABILITADO"},{"department":"CHIMALTENANGO","municipality":"SAN MIGUEL POCHUTA","town":"SAN MIGUEL POCHUTA","bda":"HABILITADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"LAS VICTORIAS","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"NUEVA ESPERANZA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"SAN ANTONIO PAJALES","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA MONTE GLORIA","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"PAMPAS LAS FLORES","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"TROCHA 1 O LA FAJA","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA MOGOLLON ALREDEDORES","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA EL MORA","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA SANTA ANA MIXTAN","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA JABALÍ","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA BRISAS DEL MAR","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA EL NOVILLERO","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA UJUXTE","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA LA SABANA","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA COSTA SUR","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA CANOÍTAS","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA SANTA ODILIA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA CEIBA AMELIA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA CHIQUE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA COLLOLATE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA EL CHARRO","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA EL COCO","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCION","town":"ALDEA ISLA CHICAL","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"NUEVA CONCEPCIÓN","town":"TROCHA 11 A LA 14","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA LA PONDEROSA","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"CHAMPAS PINULA","bda":"HORARIO AM"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"LAS BORDAS BARRILES","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"SHALON","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"JUAN JOSÉ","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA EL CHORIZO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA 17 DE ENERO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA BENDICIÓN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA JUSTO MOLINA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA 25 DE SEPTIEMBRE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"CAMINO ALDEA MORAZÁN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"LAS BORDAS BARRILES","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"JUAN JOSÉ","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"PARCELAMIENTO EL ARISCO","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA SHALOM","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA EL CHORIZO O 17 DE ENERO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA JUSTO MOLINA O 25 DE SEPTIEMBRE","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COLONIA LA PONDEROSA 1 ZONA 4","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"COMUNIDAD CEIBA HUECA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"CANOGUITAS","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"LA SIERRA","bda":"HABILITADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"ALDEA MORAZÁN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"CAMINO A ALDEA MORAZÁN","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"FINCA PALO BLANCO","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"FINCA LA CEIBA","bda":"BLOQUEADO"},{"department":"ESCUINTLA","municipality":"TIQUISATE","town":"FINCA PRIMAVERA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"EL ESFUERZO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"GUAYABAL","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"LAS ILUSIONES","bda":"HABILITADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"LAS VICTORIAS","bda":"HABILITADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTA BÁRBARA","town":"SANTA ADELAIDA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"COLONIA LAS VICTORIAS","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"GUATALON ALREDEDORES","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"SANTA ELENA 1","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"SANTA ELENA 2","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"ALDEA SANTA ELENA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"ALDEA LAS FLORES","bda":"HABILITADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"ALDEA EL TRANSITO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"ALDEA LA CAMPESINA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"ALDEA EL RECUERDO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"ALDEA SAN BASILIO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"RIO BRAVO","town":"ALDEA CANDELARIA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"CONRADO DE LA CRUZ","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"ALDEA BELEN","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"ALDEA EL COPADO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"ALDEA EL COPADITO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"SANTA LUCIA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"EL COPADO 1","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"EL COPADO 2","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO","town":"ALDEA MONTE GLORIA","bda":"HABILITADO"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"CHIMENTE","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"CHUIPACHEC","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"PACHOC","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"PAMACTZUL","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"TOTONICAPÁN","town":"TZANIXNAM","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"MOMOSTENANGO","town":"RACHOQUEL","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"MOMOSTENANGO","town":"JUTACAJ","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"MOMOSTENANGO","town":"SAN LUIS","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"MOMOSTENANGO","town":"SAN JOSÉ SEGUILA","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"MOMOSTENANGO","town":"PANCA","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"SANTA LUCIA LA REFORMA","town":"SAN LUIS Y SAN JOSÉ SEGUILA","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"SANTA MARIA CHIQUIMULA","town":"SANTA MARIA CHIQUIMULA","bda":"BLOQUEADO, SE ATIENDEN ÚNICAMENTE CLIENTES Y EXCLIENTES"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"SACPULUB","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"XABIYAGUACH","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CHUNIMA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"MACTZUL 2 Y 4","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"QUIEJEL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"XECALIBAL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CHONTANA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"CHUCOJOM","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"PAJULIBOY","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"LA CAMA 1 Y 2","bda":"HABILITADO"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO","town":"SOCOBAL SECTOR LAS ANTENAS","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO","town":"SOCOBAL","bda":"BLOQUEO PARCIAL (Habilitar calle hacia Colonia La Joyita y la joyita , e incluir hasta la 12 calle de la iglesia monte de santidad que esta sobre ese mismo sector de la Joyita.)"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO","town":"LAS ABEJAS","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO","town":"SAN JACINTO","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO","town":"TONAJUYU","bda":"BLOQUEADO"},{"department":"CHIMALTENANGO","municipality":"SANTA APOLONIA","town":"XETZAC","bda":"HABILITADO"},{"department":"CHIMALTENANGO","municipality":"SANTA APOLONIA","town":"SANTA APOLONIA","bda":"HABILITADO"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO","town":"COLONIA CARLOS RAMOS","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"PARRAXTUT","bda":"HORARIO AM"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"EL JOCOTE","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"EL PAJARITO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"SALQUIL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHUPACBALAM","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"TURBALYÁ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHACAYÁ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHUPACAY","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"XECATOLOJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHIBUC","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"EL TESORO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CERRO NEGRO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"EL LLANO GRANDE","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHUCANAC","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"SALINAS","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"MAGDALENA / MAGDALENA LA ABUNDANCIA","bda":"HORARIO AM"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"GUANTAJAU","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHIMUXIQUÍN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHUMULCHACÁN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"TZANABAJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"EL NARANJO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"PASACUL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"XETABAL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHIRRELLE","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"SAN SEBASTIÁN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"SICHUJIL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"XOLJUYUP","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CUESTA DEL ÁGUILA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHUCHUM","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"PACOXOY","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"PATZAJEL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"XETZAJEL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"XOLCHÚN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"LA MONTAÑA","bda":"HORARIO AM"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"PACHÉ","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"PATZÁN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"TIERRA COLORADA","bda":"HORARIO AM"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"XEQUIAC","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CAJUYUP","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CHAOJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"PACAGÜEX","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"TZANPOCLAJ","bda":"HABILITADO"},{"department":"CHIMALTENANGO","municipality":"ACATENANGO","town":"PAJALES 1 Y 2","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"CHICHICASTENANGO","town":"LACAMA 1 Y 2","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"PATZITE","town":"CHUICOJONOP","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"TZANCAOJIB","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CHATIAN","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"SAN ANTONIO ILOTENANGO","bda":"HABILITADO SOLO CENTRO DESDE LA ZONA 1 A LA 6 *ALDEAS ALEDAÑAS BLOQUEADAS *"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CANAMIXTOJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CHIAJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CHOTACAJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"SACXAC","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CHUICACA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CANAMIZTOJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CHICHO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CHUSICA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"PATZALA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"PATULUP","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"XEBAGUIT","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"CHIPACBCLTENA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"TZACAGUIP","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN ANTONIO ILOTENANGO","town":"SANTA MARIA CHIQUIMULA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN PEDRO JOCOPILAS","town":"LA MONTAÑA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN PEDRO JOCOPILAS","town":"LAS TUNAS","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN PEDRO JOCOPILAS","town":"PATZOJOM 1 Y 2","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN PEDRO JOCOPILAS","town":"LA ESTAZUELA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN PEDRO JOCOPILAS","town":"CAMITANCILLO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN PEDRO JOCOPILAS","town":"SANTATABAL 1 Y 2","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"CHUZCHE","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"IXCOMAL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"JORONJA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"LOS TZOC","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"CHOYOMCHE","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"LOS CERITOS","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"CHOCAMAN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"CHUJUYUB","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SANTA CRUZ DEL QUICHE","town":"CHICABRACAM","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"CANILLÁ","town":"CANILLÁ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"OCÓS","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"LAS TRES CRUCES","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"PATZÁN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"PATIO DE BOLAS","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"REJILLERO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"TZALAMÁ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"TZANCHURA","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"SAJCUÍN","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"CHUXIL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"SALIJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"LOS MAGUEYES","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"CHOTAJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"CHUCHUCUY","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"CHUIJUL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"CHUITZAJ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"JOYABAJ","town":"EL PORTUGUEZ","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SAN BARTOLOME JOCOTENANGO","town":"SAN BARTOLOMÉ JOCOTENANGO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CASCO URBANO DE RIO BLANCO","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CASCO URBANO DE TZUNUNUL","bda":"HABILITADO"},{"department":"QUICHÉ","municipality":"SACAPULAS","town":"CASCO URBANO DE RANCHO DE TEJA","bda":"HABILITADO"},{"department":"CHIMALTENANGO","municipality":"CHIMALTENANGO","town":"SOCOBAL","bda":"BLOQUEO PARCIAL (Habilitado calles principales (Bloqueando Callejones))"},{"department":"CHIMALTENANGO","municipality":"SAN PEDRO YEPOCAPA","town":"COLONIA MAYA","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"USPANTÁN","town":"UNILLA PACALÁ","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"USPANTÁN","town":"SANTA RITA","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"USPANTÁN","town":"EL VERGEL","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"USPANTÁN","town":"CASERÍO VALDIO VERGEL y/o VERGEL NUEVO","bda":"BLOQUEADO"},{"department":"QUICHÉ","municipality":"USPANTÁN","town":"ALDEA EL VERGEL CHIMAL","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"ALDEA CHAMÁ GRANDE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"SHUSHO ARRIBA","bda":"HABILITADO AM"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL CARRIZAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL DURAZNO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL LIMAR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"GUAYABILLAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"LA PUENTE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"LAS TABLAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"LIMAR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"MONJON","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"PLAN DEL GUINEO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"RINCON DE SANTA BARBARA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"LOS PELIPES","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"GUIOR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"SAN MIGUEL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"SAN ANTONIO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"LAGUNETAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"PUERTA DE LA MONTAÑA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"TABLÓN DEL OCOTAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"LA ESPERANZA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"SILLÓN ARRIBA, SILLÓN ABAJO, LOS VIDAL Y POTRERIOS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"HACIENDA EL SANTO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"POTRERIOS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL MAGUEYAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"TACÓ ARRIBA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL POSHTE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL PATO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"LA CATOCHA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"MATAZANO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL SAUCE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL BARRIAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL PALMAR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL CONACASTE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"EL GUAYABO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"PINALITO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"MARAXCO","bda":"HABILITADO AM"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"LAS LOMAS, LOMAS ARRIBA Y LOMAS ABAJO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"TIZUBIN","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"AGUA ZARCA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"CIRACIL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"EL ZAPOTE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"DOLORES","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"QUEBRADA SAN NICOLAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"PUEBLO NUEVO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"SANTA CRUZ","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JACINTO","town":"SECTOR LOS HERNANDEZ","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JOSÉ LA ARADA","town":"EL CHUCTE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JOSÉ LA ARADA","town":"CERRO DE CAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JOSÉ LA ARADA","town":"EL RODEO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JOSÉ LA ARADA","town":"EL CHILAR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JOSÉ LA ARADA","town":"GRANADILLAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JOSÉ LA ARADA","town":"EL TAMBOR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"SAN ANTONIO LAJAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"CHISPAN JARAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"QUEQUEZQUE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"MINAS ABAJO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"MINAS ARRIBA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"PEÑASCO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"EL SARZAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"LA CEIBA Y LA CEIBITA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"LOS ENCUENTROS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"CHURISCHAN","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"EL CARRIZAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"RIO ARRIBA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"TASHARJA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"SAN JUAN ERMITA","town":"TAXARJA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"COLONIA 14 DE SEPTIEMBRE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"ALDEA SANTA BARBARA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CHIQUIMULA","town":"ALDEA SANTA BARBARA/BARRIO EL YAJAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"SHALAGUA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"EL GUAYABO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"TESORO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"USHÁ","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"USHURAJÁ","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"TIERRA BLANCA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"CAÑON DE TISIPE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"ALDEA PAJCO","bda":"HABILITADO AM"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"PLAN LA LIMA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"EL ROBLARCITO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"EL VOLCÁN","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"NEAREAR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"PASHAPA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"CAULOTES","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"PORTEZUELO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"EL RODEO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"PLAN DEL BORDO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"MARIMBA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"CHAGUITON","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"CAJÓN DEL RIO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"DESPOBLADO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"CASERIO EL HATO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"ALDEA GUIOR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"ALDEA MOROLA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"ALDEA SOTOCO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"CASERIO CARRIZALITO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"DOS QUEBRADAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"LIMON","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"MOROLA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"SOCOTOCO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"TACHOCHE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"TISAMARTE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"TULAR","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"CAMOTÁN","town":"ALDEA TAPUAN","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"INGENIERO GUARAQUICHE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ALDEA OQUEN","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ALDEA TAPUAN","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"CASERIO EL ESPINAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ALDEA MATAZANO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"CASERIO SUCHIQUER","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ALDEA EL AMATILLO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ALDEA PELILLO NEGRO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ENCUENTRO GUARAQUICHE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ALDEA AGUAZARCA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"CASERIO LOS HERNANDEZ","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"TUNUCO ABAJO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"TUNUCO ARRIBA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"PLAN DE LA ARADA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"TESORO ARRIBA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"ALDEA CANAPARA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"EL NARANJO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"EL NANCE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"GUARERUCHE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"LA ARADA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"LA MINA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"OCUMBLA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"OREGANO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"PACREN","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"PIEDRA PARADA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"POTRERO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"QUEBRADA SECA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"RODEITO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"TALQUEZAL","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"JOCOTÁN","town":"TONTOLES","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"IPALA","town":"EL JUTE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SELICH LOTE 13","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"PATAXTE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"BOCA ANCHA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"MANGUITO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"LOS ÁNGELES PENCALÁ","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SEMUY I","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SEMUY II","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"COLONIA SANTIAGUITO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CHAPIN ARRIBA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CHAPIN ABAJO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"GUARITAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CHINEBAL","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"RIO SAUCE LOTE 12","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SEMANZAN","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CHINACHABILCOCH","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"QATA TOMASA/INVASIÓN","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"LA UNIÓN","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"3 QUEBRADAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"RUBEL HU","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SAQCHAHILA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CADENA SEMUC","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SEMUC","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SANTA MARIA SEMUC","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"EL QUETZAL","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"RUBEL PEC ABAJO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"RUBEL PEC ARRIBA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SEXAN LOTE","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SEMUY LOTE 14","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SANTO DOMINGO LOTE 10","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"EL BONGO","bda":"HORARIO AM HASTA LAS 14:00 PM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"NIMLANBENQUE","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SEACACAR","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"MARCAJAM","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CHINABENQUE","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CERRITOS","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"BARRIO NUEVO","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SINAI","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SAPOTILLO","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"EL ESTOR","town":"RIO ZARCO","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"SAUCE","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"CHUPOM","bda":"HABILITADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"INVASIÓN SETAL","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"EL ESTOR","town":"BARRIO RIO VIVO","bda":"HORARIO AM"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"PLAN DE LA ARADA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"LAS TORERAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"EL OLVIDO","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"EL SALITRE","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"LAS SOPAS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"ALDEA VALLE DE JESUS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"ALDEA SAN ISIDRO","bda":"HABILITADO AM"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"ALDEA EL CARRIZAL","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"LLANO DE LOS TOROS","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"JOYITAS","bda":"HABILITADO AM"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"EL MOJÓN","bda":"HABILITADO AM"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"EL RINCON DE LEON","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"CHIRAMAY","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"ESQUIPULAS","town":"LA RUDA / BELEN","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"PIEDRA DEL AMOLAR","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"PIEDRA DE LA CUMBRE","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"LA CUMBRE","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"LA CUMBRITA","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"LOS VASQUEZ","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"EL RODEO","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"LOS LIRIOS","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"VALLE NUEVO","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"LOS RAIREZ","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"LA RINCONADA","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"OLOPA","town":"CARRETERA ANTIGUA A OLOPA","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE","town":"CHIRAMAY","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE","town":"LA CIDRA (PARAJE)","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE","town":"LA RUDA","bda":"HABILITADO"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE","town":"LOS PLANES","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE","town":"LA CUMBRE (PARAJE)","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE","town":"AGUA FRIA","bda":"BLOQUEADO"},{"department":"CHIQUIMULA","municipality":"QUEZALTEPEQUE","town":"LA MONTAÑA (PARAJE)","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"LA MONTAÑA","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"SANTA ANA","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"SAN CLEMENTE","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"LOS ACHIOTES S.C.","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"EL JUTILLO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"SAN JUAN","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"CACAO VIEJO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"PAN DEL BARRO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"EL VIJAGUAL","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"EL MIRADOR","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"GUACAMAYAS","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"LOS TABLONES","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"EL MORAL","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"EL PACAYAL","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"LOS PLATANILLOS","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"PIEDRAS GRANDES","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"CRUZ DE PINO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"SACABASTOS","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"MORAZÁN","town":"EL CIPRESAL","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"PUERTA DE GOLPE","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"CHANRALLO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"EL CONTE","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"CUCHILLA DE PAJA","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"AGUA HIEL ARRIBA","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"EL CIMIENTO","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"EL MORRO","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"LAS ESCALERAS","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"PIEDRA DE ARCO","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"TECUIS","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"CONACASTE","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"COMAJA","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"EL NANSAL","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN AGUSTÍN ACASAGUASTLAN","town":"LA MONTAÑITA","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN CRISTÓBAL ACASAGUASTLAN","town":"SAN LUIS BUENA VISTA","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN CRISTÓBAL ACASAGUASTLAN","town":"MONTE VIRGEN","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN CRISTÓBAL ACASAGUASTLAN","town":"LA ENCARNACION","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"GUASTATOYA","town":"EL NARANJO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"GUASTATOYA","town":"EL INFIERNILLO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"GUASTATOYA","town":"SAN RAFAEL","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"GUASTATOYA","town":"FINCA CRUZ","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"GUASTATOYA","town":"PATACHE","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"GUASTATOYA","town":"ANSAHAGUA","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"GUASTATOYA","town":"SUBINAL","bda":"HABILITADO"},{"department":"JALAPA","municipality":"JALAPA","town":"TALPETATE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"TALQUEZAL","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"LOMA DE EN MEDIO","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"JALAPA","town":"AZUCENAS","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"JALAPA","town":"MIRAFLORES","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"JALAPA","town":"ALTUPE","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"JALAPA","town":"ORCHOJO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"EL GUAJE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"LOS LIMARES","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"EL JUTE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"LOS CEBOLLINES","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"ARAYZAPO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"OJO DE AGUA SAN JOSÉ CARRIZAL","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"LA PUENTE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"EL TOBON","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"CERRO ALCOBA","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"JALAPA","town":"CARRIZAL GRANDE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"EL INGENIO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"LA PASTORIA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"SAN MIGUEL MONJON","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"SANTA ELENA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"POTRERO CARRILLO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"ALDEA LLANO DE LA PUERTA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"ALDEA LA VENTURA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"ALDEA SANYUYO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"JALAPA","town":"ALDEAS DESPUES DE SANYUYO","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"JALAPA","town":"SANSIRISAY","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"LAVADEROS","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"MOLINO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"SAN MIGUEL","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"PAJAL","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"ÁNIMAS","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"EL MANZANO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"SAMORORO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"LA SIENIGA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"SANSUPO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"JOYA DEL CEDRO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"JOYAS DEL MORA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"LA ESPERANZA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"LAS BRISAS","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"LAS MESAS","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"EL TERRERO","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"EL DURAZNITO","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"EL ESCOBAL","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"JOYA GALANA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"EL REFUGIO BUENA VISTA","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"BUENA VISTA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"ALDEA EL PAJAL","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"ALDEA GRACIAS A DIOS","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"ALDEA EL AGUACATE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"MATAQUESCUINTLA","town":"EL BOSQUE BUENA VISTA","bda":"HORARIO AM"},{"department":"JALAPA","municipality":"SAN LUIS JILOTEPEQUE","town":"SAN JOSÉ LAS PILAS","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN LUIS JILOTEPEQUE","town":"ALDEA LOS ÁNGELES","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN LUIS JILOTEPEQUE","town":"ALDEA CHAGÜITON","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN LUIS JILOTEPEQUE","town":"ALDEA EL CAMARÓN","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"FLOR DEL CAFÉ","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"LA CANDELARIA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"RIO BLANCO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL NARANJO, LAGUNA SECA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"SAN IGNACIO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL ARROLLO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL CAHULOTE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"LAGUNILLA, SANSAYO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL CUJITO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL MORRITO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA NUEVA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"LA MONTAÑITA DE LA VIRGEN","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"BUENA VISTA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"PIEDRAS NEGRA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"LA CEIBA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"POTRERO CARRILLO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"LAS CRUCITAS","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL CESTIADERO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL AGUAMECATE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"TOBON","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"GUISILTEPEQUE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"PITAHAYAS","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"LA PASTORIA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL CUAJILOTE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"RIACHUELO SANTO DOMINGO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"LAS PALMAS EL CHAPARRAL","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL MANGUITO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA EL ZUNZO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"GUAYABITO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"PLAN DE LA CRUZ","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"EL DURAZNO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA LA PUERTA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA LAS AGUJITAS","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA EL PINALON","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA EL CUJITO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA EL MAESTRILLO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN PEDRO PINULA","town":"ALDEA YERBABUENA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"PINO ZAPOTON","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"TAPALAPA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"ALDEA BUENA VISTA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"EL ZAPOTE","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"INGENIO DE AYARZA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"EL ASTILLERO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"TIERRA COLORADA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"EL MANZANILLO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"EL RETIRO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"INGENIO FIERRO","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"LA VICENTINA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN CARLOS ALZATATE","town":"LAS FLORES","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN MANUEL CHAPARRÓN","town":"LA PALMILLA","bda":"BLOQUEADO"},{"department":"JALAPA","municipality":"SAN MANUEL CHAPARRÓN","town":"ALDEA LAS ÁNIMAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"EL RICO","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LOS AMATES","town":"LAS VIÑAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"PUENTE DIEZ","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"CHAPULCO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"EL REFUGIO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"EL AGUACATE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"MANACO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"NATALIA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LOS AMATES","town":"BALANDRA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"DAKOTA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LOS AMATES","town":"NAHOA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LOS AMATES","town":"SEMINOLA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LOS AMATES","town":"ALDEA CERRO CHINO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"SAN JOSÉ ALSACIA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LOS AMATES","town":"CASERIOS LIMITE HONDURAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"BUENA VISTA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"MOJANALES 2","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"BACADILLA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"PLAYA DORADA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"MARISCOS","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"CAMPO 3","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"COCACLES","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"TRES PINOS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"ALDEA PEÑITAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"LOS LAURELES","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"RIO FRIO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"MONTAÑA DE VALLE NUEVO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"NUEVA JERUSALEN","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"LOTE SECTOR A Y B","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"LOS ANGELES","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"POZA JOSEFINA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"PLAYA ICACAL","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"IZABAL","town":"LA ESPERANZA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"MODESTO MENDEZ","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"EL CALVARIO","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"PARACAIDISTA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"ALDEA SETAL","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"CHOCON","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"COCOLI","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"LAGUNITA EL SALVADOR","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"CAYO QUEMADO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"BLUE CREEK","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"TAMAGAS CREEK","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"GUITARRAS","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"NUEVA TORTUGAS","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"MONTE ALEGRE","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"EL AGUACATE","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SANTA CRUZ JIQUITI","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"EL CIMARRONCITO","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"LA ESMERALDA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"CASTULO CREEK","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"LA CEIBITA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"NIMLASAHAL","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"CAQUICHOCH","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"CAQUI CREEK","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"CHACALTE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SEARRANX","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SEMANZANA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SOSELA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SEMABILA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SECOYUCTE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SEMACHACA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SEPEMECH","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SECAR O SECAXTE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"4 CAYOS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"COCOS CREEK","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"CHINACADENAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"PUNTA DE COCOLI","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"AERCOCHOCH","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SEBENQUE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"ALDEA MONTE CARMELO","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"ALDEA SAN JUAN PACAYAL","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"ALDEA SANTO ROSARIO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"COMUNIDAD DOS ZAPOTILLOS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SUMACHITO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"NUEVA LAS TORTUGAS","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"TAMAGAS","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"COYOUTE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SEMOX","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"SAHILÁ","bda":"HABILITADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"PLAN GRANDE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"PLAN GRANDE QUEHUEQUE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"PLAN GRANDE TATIN","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"TATIN","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"LA LAGUNA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"MIRAMAR","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"LIVINGSTON","town":"BARRA LAMPARA","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"MORALES","town":"RIO NEGRO","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"LA CEIBA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"LA CEIBITA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"SAN JOAQUIN","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"LAS ANIMAS","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"TEPEMECHINES","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"LAS JARAS","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"MORALES","town":"EL CAFETALITO","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"AMATES","town":"AGUA CALIENTE","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"AMATES","town":"LA UNION","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"AMATES","town":"LA DEMOCRACIA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"AMATES","town":"MONTAÑA NAHUA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"AMATES","town":"LA PALMILLA VEGA GRAN","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"AMATES","town":"ALDEA LA PITA","bda":"HORARIO AM"},{"department":"IZABAL","municipality":"AMATES","town":"EL AGUACATE","bda":"BLOQUEADO"},{"department":"IZABAL","municipality":"AMATES","town":"GALLUSER","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"CERRO BLANCO","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"ALDEA EL JICARO","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"PILA ESCONDIDA","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"EL FLORIDO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"EL CARMEN","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"EL JUTE","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"BARRANQUILLO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"LA TABLA","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"QUEBRADA GRANDE","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"SANTA LUCIA LOS OCOTES","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SANARATE","town":"MONTEPEQUE","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"SANTO DOMINGO LOS OCOTES","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"LOS PLANES","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"LLANO LARGO","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"CUCAJOL","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"LAS MORITAS","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"EL NARANJO","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"LOS ASTALES","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"ENCUENTRO LAS NAVAJAS","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"EL SOYATE","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"LOS GRACIANOS","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SAN ANTONIO LA PAZ","town":"NUEVO SANTO DOMINGO","bda":"BLOQUEADO"},{"department":"EL PROGRESO","municipality":"SANSARE","town":"LA MONTAÑITA","bda":"HABILITADO AM"},{"department":"EL PROGRESO","municipality":"SANSARE","town":"POZA VERDE","bda":"HABILITADO AM"},{"department":"EL PROGRESO","municipality":"SANSARE","town":"LAS CABEZAS","bda":"HABILITADO"},{"department":"EL PROGRESO","municipality":"SANSARE","town":"EL AGUAJE","bda":"HABILITADO"},{"department":"ZACAPA","municipality":"RÍO HONDO","town":"LA PEPESCA","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"CABAÑAS","town":"LA LAGUNA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"HUITÉ","town":"LA OSCURANA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"HUITÉ","town":"ALDEA STA. CRUZ","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"HUITÉ","town":"EL GUACAMAYO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"HUITÉ","town":"EL JUTE","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"GUALÁN","town":"BETHEL","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"GUALÁN","town":"LAS CARRETAS","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"ZACAPA","town":"PUEBLO MODELO","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"ZACAPA","town":"CEMENTERIO NUEVO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"ZACAPA","town":"LOMA DEL VIENTO","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"ZACAPA","town":"STA. ANITA LAJINCO","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"ZACAPA","town":"CANOGUITAS","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"ESTANZUELA","town":"EL GUAYABAL","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"EL CAPUCALITO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"EL VOLCANCITO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"EL SAUCE","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"LA JIGUA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"TIMUSHA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"CARI","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"AGUA FRIA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"EL PROGRESO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"ZACAPA","town":"AGUA FRIA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"ZACAPA","town":"EL VOLCÁN SAMAICA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"SAN JORGE","town":"PLAN DEL MORRO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"SAN JORGE","town":"SIMARRON","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"HUITÉ","town":"SAN MIGUELITO","bda":"HORARIO AM"},{"department":"ZACAPA","municipality":"ZACAPA","town":"CERRO CHIQUITO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"ZACAPA","town":"CERRO GRANDE","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"LAMPOCOY","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"BEJUCAL","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"TASHARTE","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"PACAYALITO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"COROZAL","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"GUARANJA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"ESQUIPULITAS","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"CAPUCAL","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"TAGUAYNI","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"PEÑA BLANCA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"CAMPANARIO EL PROGRESO","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"PESHJA","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"CHAGUITON","bda":"BLOQUEADO"},{"department":"ZACAPA","municipality":"LA UNIÓN","town":"CUMBRE ALTA","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"ALDEA EL GUAPINOL","bda":"BLOQUEO PARCIAL (Habilitado Horario Am Solo Casco Urbano Sobre Calle Principal, Sin Ingreso A Callejones)"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"ALDEA LA DEMOCRACIA","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"PAJAPITA","town":"CANTÓN LA PLAYA","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"PAJAPITA","town":"CASERIO EL TAMARINDO","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"PAJAPITA","town":"SECTOR EL MARAÑÓN","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"OCOS","town":"OCOS","bda":"BLOQUEADO *EXCEPTO CARRETERA PRINCIPAL DE TECÚN UMÁN A OCOS, SE ATIENDE CALLE PRINCIPAL Y EN CALLEJONES SE ATIENDEN INGRESANDO ÚNICAMENTE HASTA 3 KILÓMETROS, Y EN EL CENTRO DE OCOS SOLO CASCO URBANO"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"PLAN DE LA GLORIA","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"EL RETIRO","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"VILLA VERDE","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"PALMA REAL","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"ALDEA NUEVA GRANADA","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"EL TUMBADOR","town":"COMUNIDAD AGRARIA PLAN DE ARENA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COATEPEQUE","town":"EL CAMPAMENTO","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COATEPEQUE","town":"CAMPO SANTO","bda":"HABILITADO HASTA LA PARADA DE BUSES DE MAGNOLIA"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"COLONIA LA FLORIDA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"COLONIA SAN ANTONIO","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"ALDEA SANTA ROSA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"COMUNIDAD SANTO DOMINGO","bda":"HABILITADO AM"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SECTOR EL RETIRO COMUNIDAD AGRARIA MERCEDES","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"COLONIA NUEVO COLOMBA","bda":"BLOQUEO PARCIAL (Habilitado Callejones 1,2 y 3 (horario AM)"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SECTOR PIEDRA BLANCA COMUNIDAD AGRARIA MERCEDES","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"ALDEA CHUVA","bda":"HABILITADO AM"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SAN MIGUEL","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SECTOR LA HORTALIZA MERCEDES","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SAN FRANCISCO","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SECTOR LA CIBA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"EL RETIRO","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"PIEDRA BLANCA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SECTOR LA HORTALIZA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"LA MONTERREAL","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"GALVEZ","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"COLONIA ESQUIPULAS","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"COLONIA SAN MIGUEL","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"COLONIA 1 DE MAYO","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"BUENA VISTA","bda":"HABILITADO"},{"department":"QUETZALTENANGO","municipality":"COLOMBA","town":"SECTOR CAMPO/MERCEDES COLOMBA","bda":"HABILITADO HASTA LA ESCUELA"},{"department":"QUETZALTENANGO","municipality":"FLORES COSTA CUCA","town":"ALDEA JUAREZ","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"FLORES COSTA CUCA","town":"ALDEA GRANADOS 1","bda":"HABITADO AM"},{"department":"QUETZALTENANGO","municipality":"FLORES COSTA CUCA","town":"ALDEA GRANADOS 2","bda":"HABITADO AM"},{"department":"QUETZALTENANGO","municipality":"FLORES COSTA CUCA","town":"LAS BRISAS","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"GENOVA","town":"VALPARAÍSO","bda":"HABITADO AM"},{"department":"QUETZALTENANGO","municipality":"GENOVA","town":"PARCELAMIENTO ARIZONA","bda":"HABITADO AM"},{"department":"QUETZALTENANGO","municipality":"COATEPEQUE","town":"CHUATUJ SECTOR 2","bda":"BLOQUEO PARCIAL (Habilitado 1 cuadra a la derecha de la carretera principal y 1 cuadra a la izquierda de la carretera principal)"},{"department":"QUETZALTENANGO","municipality":"COATEPEQUE","town":"CHUATUJ SECTOR 3","bda":"BLOQUEO PARCIAL (Habilitado 1 cuadra a la derecha de la carretera principal y 1 cuadra a la izquierda de la carretera principal)"},{"department":"QUETZALTENANGO","municipality":"COATEPEQUE","town":"CHUATUJ SECTOR 4","bda":"BLOQUEO PARCIAL (Habilitado 1 cuadra a la derecha de la carretera principal y 1 cuadra a la izquierda de la carretera principal)"},{"department":"QUETZALTENANGO","municipality":"COATEPEQUE","town":"CHUATUJ SECTOR 5","bda":"BLOQUEO PARCIAL (Habilitado 1 cuadra a la derecha de la carretera principal y 1 cuadra a la izquierda de la carretera principal)"},{"department":"SAN MARCOS","municipality":"LA BLANCA","town":"SALINAS L Y LL","bda":"HORARIO AM"},{"department":"SAN MARCOS","municipality":"LA BLANCA","town":"LOS CERRITOS","bda":"HORARIO AM"},{"department":"SAN MARCOS","municipality":"LA BLANCA","town":"LAURELES","bda":"HORARIO AM"},{"department":"SAN MARCOS","municipality":"LA BLANCA","town":"TILAPA","bda":"HORARIO AM"},{"department":"SAN MARCOS","municipality":"LA BLANCA","town":"MADRONALES","bda":"HORARIO AM"},{"department":"SAN MARCOS","municipality":"NUEVO PROGRESO","town":"SANTA CLARA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"CONCEPCIÓN CHINAN SECTOR 1","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"CONCEPCIÓN CHINAN SECTOR 2","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"CONCEPCIÓN CHINAN SECTOR 3","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"CONCEPCIÓN CHINAN SECTOR 4","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"EL PITO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"CANTÓN EL PITO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"FINCA SAN MIGUEL MOCA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"CHICACAO","town":"REPOSICIÓN MOCA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"SALACHE","bda":"BLOQUEO PARCIAL (Habilitado campo Chichomota calle principal (solo horario AM)"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"EL COMPROMISO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"EL COMPROMISO ÁREA LA LÍNEA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"SANTA MARTA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"LAS FLORES","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"BARRIO CANDELARIA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"CANTON SALACHÉ","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"CHIMULHUA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"CANTON TABASCO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"EL PROGREGO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"LINEA DEL COMPROMISO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"MAZATENANGO","town":"NARANJALES","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"PUEBLO NUEVO","town":"SAN FRANCISCO PECUL","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ LA MÁQUINA","town":"PARCELAMIENTO BUENOS AIRES","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ LA MÁQUINA","town":"PARCELAMIENTO EL SALTO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ LA MÁQUINA","town":"ZONA 1","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ LA MÁQUINA","town":"SECTOR SIS","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ LA MÁQUINA","town":"TULATE","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN ANTONIO","town":"CHEQUEZ","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN ANTONIO","town":"ALDEA TRINIDAD","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN ANTONIO","town":"ALDEA CANDELARIA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN ANTONIO","town":"ALDEA MONTERRAMOS","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ EL ÍDOLO","town":"ALDEA SANTIAGO CABRICAN","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ EL ÍDOLO","town":"NAHUALATE 2","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ EL ÍDOLO","town":"CABRICAN","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN JOSÉ EL ÍDOLO","town":"SAN JUAN LAPAZ","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN MIGUEL PANÁN","town":"SAN RAFAEL BUJIILLA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN MIGUEL PANÁN","town":"CANTÓN VERACRUZ","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"CONRADO DE LA CRUZ","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"ALDEA BELÉN","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"ALDEA EL COPADO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"ALDEA EL COPADITO","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"SANTA LUCIA","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"EL COPADO 1","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"EL COPADO 2","bda":"BLOQUEADO"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"ALDEA MONTE GLORIA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"XIQUINÁ","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"SAN JUAN CERRITOS","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"COMUNIDAD AGRARIA LA ESPERANZA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"COMUNIDAD CONRADO DE LA CRUZ","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"COMUNIDAD EL GUAJILOTE","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"COMUNIDAD MONTE GLORIA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"EL TRIUNFO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"PARCELAMIENTO JAPON","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"PUNTA ARENA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"SAN MAURICIO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"SECTOR CANALES","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"CHICAGO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"TAHUEXCO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"CHURRIRIN","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"CANTON EL MANGAL","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"COMUNIDAD LA VEGA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"COMUNIDAD MANELIZ","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"SANTA CRUZ LAREDO","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"SALINAS EL TIGRE","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"LA LIMONADA","bda":"BLOQUEAR"},{"department":"SUCHITEPÉQUEZ","municipality":"SANTO DOMINGO SUCHITEPÉQUEZ","town":"EL POCHAL","bda":"BLOQUEAR"},{"department":"SUCHITEPÉQUEZ","municipality":"CUYOTENANGO","town":"PAJALES LA CUCHILLA","bda":"HORARIO AM"},{"department":"SUCHITEPÉQUEZ","municipality":"SAN FRACISCO ZAPOTITLÁN","town":"CANTON SAN JOSE","bda":"HORARIO AM"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUATAN","town":"CASERIO PAKAWEK","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"SAN CARLOS SIJA","town":"AGUA CALIENTE","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"SAN JUAN OSTUNCALCO","town":"TIZATE","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"CHAMPERICO","town":"BARRIO GUAYACÁN","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"CHAMPERICO","town":"LA LIMONADA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"CHAMPERICO","town":"VIÑAS DEL MAR","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"CHAMPERICO","town":"COLONIA LA FELICIDAD","bda":"HORARIO AM, SOLO CALLE PRINCIPAL, NO APLICA ULTIMA CUADRA DE LOS CALLEJONES."},{"department":"RETALHULEU","municipality":"CHAMPERICO","town":"20 DE OCTUBRE","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"CHAMPERICO","town":"BELLA VISTA","bda":"HABILITADO ÚNICAMENTE LAS 2 CUADRAS DESPUÉS DE AVENIDA MAZATENANGO EN HORARIO AM, LAS DEMÁS CUADRAS Y TODO LO LO QUE ESTA EN ORILLA DE PLAYA BLOQUEADO"},{"department":"RETALHULEU","municipality":"CHAMPERICO","town":"TODO LO QUE ES PLAYA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"EL ASINTAL","town":"LA MARINA","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"EL ASINTAL","town":"SECTOR RIVERA","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"EL ASINTAL","town":"SAN RAMON","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"EL ASINTAL","town":"SECTOR BARRIADA /PUENTE SIBANA","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"EL ASINTAL","town":"SECTOR SANTA ELENA","bda":"HABILITADO AM ÁREA POBLADA A ORILLA DE LA CARRETERA"},{"department":"RETALHULEU","municipality":"EL ASINTAL","town":"LOTIFICACIÓN ESPAÑA","bda":"HORARIO AM"},{"department":"RETALHULEU","municipality":"EL ASINTAL","town":"ALDEA SAN RAFAEL","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ / LA FELICIDAD","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ / GUARDIANÍA I Y II","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ / SAN JUAN","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ / EL EDEN","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ / CAMELIAS","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ / SAN SALVADOR","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"MONTUFAR/SECTOR EL COCO","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CAMINO DE MONTUFAR PARA ALDEA BARRIOS","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"LA LUZ DEL BARRIO","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"ALDEA CANDELARIA XOLHUITZ/SAN SALVADOR","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ/EL ELDEN","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"VERSALLES/SANTO DOMINGO","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"EL HATO","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"ALDEA BARRIOS","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANTON GRANADOS/SECTOR 3","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CANDELARIA XOLHUITZ/CASERIO CAMELIAS","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"SECTOR LOPEZ/SANTO DOMINGO","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"CASERIO NUEVA CANDELARIA / AYUTIA","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"NUEVA CANDELARIA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"PARCELAMIENTO CABALLO BANCO/EL INFIERNITO","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"LA CEIBILLA","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"LAS CRUCES","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"LOTIFICACIÓN RODRIGUEZ","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"LOTIFICACIÓN 3 DE ENERO","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"SAN JOSÉ LA GLORIA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"FINCA LA RUSIA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"SANTA CECILIA/CAMINO PARA NUEVA CANDELARIA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"CASERIO LA TORTUGA/CAMINO PARA NUEVA CANDELARIA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"FINCA SANTA INES/CAMINO PARA NUEVA CANDELARIA","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"PARCELAMIENTO CABALLO BANCO/LA CEIBITA","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"LOTIFICACIÓN NUEVO AMANECER","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"LOTIFICACIÓN FLAMENCO","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"PILAS II","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"EL PORVENIR","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"RETALHULEU","town":"EL AMANECER","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLA SECA","town":"ALDEA PAJAS SECTOR LOS CHUNES","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLA SECA","town":"ALDEA PAJALES CENTRAL","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLA SECA","town":"CANTON BACAJIA 1","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLA SECA","town":"CANTON SUNUCHE 1 Y 2","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLA SECA","town":"CANTON BACAJIA 2","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLA SECA","town":"BACAJIA I/SECTOR LA CANTINA","bda":"HABILITADO EN HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLASECA","town":"ALDEA PAJALES ANEXO 1","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLASECA","town":"ALDEA PAJALES ANEXO 2","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN ANDRÉS VILLASECA","town":"ALDEA PAJALES LA CUCHILLA","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN FELIPE","town":"CANTON LOS ÁNGELES","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN FELIPE","town":"SAN FRANCISCO VELA","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN FELIPE","town":"SAN FRANCISCO VELA/SECTOR GUADALUPE","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SAN FELIPE","town":"COMUNIDAD LA FRATERNIDAD","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN SEBASTIÁN","town":"ALDEA SAN LUIS","bda":"HABILITADO AM AVENIDA PRINCIPAL ASFALTAD"},{"department":"RETALHULEU","municipality":"SAN SEBASTIÁN","town":"CANTON SAMALA II","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SAN SEBASTIÁN","town":"ALDEA SAN LUIS/SECTOR LOS MÉNDEZ","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SAN SEBASTIÁN","town":"ALDEA SAN LUIS/EL ZAPOTE","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLCIAN CALLEJONES"},{"department":"RETALHULEU","municipality":"SAN SEBASTIAN","town":"ALDEA SAN LUIS/SECTOR RECINOS","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SAN SEBASTIÁN","town":"ALDEA SAN LUIS/CANTON LA LIBERTAD","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"RETALHULEU","municipality":"SAN SEBASTIÁN","town":"ALDEA SAN LUIS/SECTOR LA CANTINA O SECTOR GUADALUPE","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA LOLITA","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA MANGALES","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"CANTON SIGLO I","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"CANTON SIGLO 1 SECTOR DE LEON","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA LOLITA / SECTOR SÁNCHEZ","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA LOLITA / SECTOR ALVARADO","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA LOLITA / SECTOR HERNÁNDEZ","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA LOLITA / SECTOR EL PITAL","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA LOLITA / SECTOR CHÁVEZ","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUA","town":"ALDEA LOLITA / SECTOR LA LIMONADA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"GENOVA","town":"VALPARAÍSO","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"GENOVA","town":"PARCELAMIENTO ARIZONA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"EL PALMAR","town":"FINCA ALIANZA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"EL PALMAR","town":"FINCHA ESPERANZA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"EL PALMAR","town":"FINCA SAN ANTONIO","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"EL PALMAR","town":"ALDEA NIMINÁ","bda":"HABILITADO AM"},{"department":"QUETZALTENANGO","municipality":"EL PALMAR","town":"LA BOTA","bda":"BLOQUEADO"},{"department":"QUETZALTENANGO","municipality":"EL PALMAR","town":"CALAHUACHE","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"LA BENDICIÓN / XOLHUITZ","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"LA GUARDIANÍA / XOLHUITZ","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"SAN JUAN / XOLHUITZ","bda":"HABILITADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"EL EDEN / XOLHUITZ","bda":"HABILITADO AM"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"CAMELIAS / XOLHUITZ","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"NUEVO SAN CARLOS","town":"SAN SALVADOR / XOLHUITZ","bda":"BLOQUEADO"},{"department":"RETALHULEU","municipality":"SANTA CRUZ MULUÁ","town":"ALDEA BOXOMÁ","bda":"HABILITADO AM"},{"department":"SOLOLÁ","municipality":"NAHUALÁ","town":"PAQUILA","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"NAHUALÁ","town":"CHUIGIRONDINA","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"NAHUALÁ","town":"CHICOCAB","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"NAHUALÁ","town":"CHIBAQUIB","bda":"HABILITADO HORARIO AM SOLO CENTRO"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTLAHUACÁN","town":"PASAJQUIN","bda":"HABILITADO HORARIO AM SOLO CENTRO"},{"department":"SOLOLÁ","municipality":"SOLOLÁ","town":"PUJUJIL 1,","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"SOLOLÁ","town":"PUJUJIL 2,","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"SOLOLÁ","town":"PUJUJIL 3,","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"CONCEPCION","town":"PUJUJILITO,","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"SOLOLÁ","town":"CHURUNELES 1,","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"SOLOLÁ","town":"CHURUNELES 2,","bda":"BLOQUEADO"},{"department":"SOLOLÁ","municipality":"SANTA CATARINA IXTAHUACÁN","town":"CASERIO PAKAWEK","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO","town":"PANIYA","bda":"BLOQUEADO"},{"department":"TOTONICAPÁN","municipality":"SANTA LUCIA LA REFORMA","town":"SAN LUIS Y SAN JOSÉ SIGUILA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"LANQUÍN","town":"CHISUBÍN","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"LANQUÍN","town":"SERRA QUICHE","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"LANQUÍN","town":"PECMO","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"CAHABÓN","town":"SANTA MARIA KANAITZAM","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"CAHABÓN","town":"JUANATUX I Y JUANATUX II","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"CAHABÓN","town":"ALDEA EL CARMEN","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIJELIJA","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"SETEX","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CARECHEJ","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"EL ROSARIO","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CECILIA","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"OQUEDA","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"XICACAU","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"PURULA","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHACALTE","bda":"HABILITADO AM, Aldeas después de Chacalte bloqueado"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHITAP","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIYAXUT","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHAIMAL ALDEA ALEDAÑAS","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHAJQUEJ CHANYUC","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIJOTOM","bda":"HABILITADO AM"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIGUARROM","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIWOYO","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIMO","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIONON","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIQUELEU","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIQUIC","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"ESPERANZA CHILATZ","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"ESPERANZA CHIZON","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"ESPERANZA SEHUBUB","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"LA UNIÓN POPOLHA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"SECONTI","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"MUYHA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"TIPULCAN","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CHIRREQUICHE / CHIBAX","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"MARIA AUXILIADORA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CAQUIGUAL","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN PEDRO CARCHA","town":"CAQUITOM","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"LA NUEVA ESPERANZA TERMINAL DE BUSES SECTOR 3","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"LA REJOYA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"CHOVAL TERRACERÍA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"SECHAJ LA UNION ENTRADA POR DISTRITO EL NASARENO DE UCULA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"SECHAJ LA UNION ENTRADA POR SANTO TOMAS Y CHORAL","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"OSTUA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"ALDEAS DESPUÉS DE SAMAC","bda":"HABILITADO después de Samac la comunidad Sanimtaq’a únicamente, todas las demás aldeas BLOQUEADAS."},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"SAXOC A UN COSTADO DE GASOLINERA CERRO LINDO","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"ALDEA CHIRREMESCHE","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"FINCA SACHA MACH (SECTOR BASURERO Y ORILLAS DEL RIO CAHABÓN, ÁREA INVADIDA)","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"COBÁN","town":"FINCA CUBILGUITZ (ÁREA INVADIDA-RUTA A CHISEC Y RUTA A CANGUINIC)","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"COBAN","town":"CHAJXUCUB O CHAJCHUCUB","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"CAKIXINCHE","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"CHEXENA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"CHIMOX","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"COJILA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"PAAPA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"SACHALIB","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"SAN MARCOS","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"SEOGUIS","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"SAQUIB","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"SOTZIL","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SAN JUAN CHAMELCO","town":"SAN BARTOLOME SECAJ Y ALDEAS UBICADAS DESPUÉS DE ESA ALDEA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"EL NARANJAL","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SEACTE I","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"LAS PAVAS","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"LAS PALMAS","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"EL PARAISO","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SAN SIMÓN LA BOTA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SAN LUCAS MALCOTAL","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SEACTE II","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SANTA ROSA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"EL CACAO I","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SANTA ISABEL LA ISLA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SANTA MARTA SEHATZI","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SANTA MARIA SEBAÑOS","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"LA MOJARRA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"SEBAÑOS","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ESPERANZA I LA ISLA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ESPERANZA II","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"LA BENDICIÓN","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ARENAL I","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ESPERANZA III","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ARENAL II","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"EL ROSALITO","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ERIAL DEL PILAR","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"LA CASTELLANA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"MICROPARCELAMIENTO EL CACAO I","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ALDEA AL PARAISO","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ALDEA SANTA ISABEL LA ISLA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"FRAY BARTOLOMÉ DE LAS CASAS","town":"ALDEA ARENAL I","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SAN CRISTÓBAL VERAPAZ","town":"REXQUIX","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SENAHU","town":"CHULAC","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SENAHU","town":"ALDEA SENARAC","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CATARINA LA TINTA","town":"SANTO DOMINGO 2 Y ALDEAS DESPUÉS DE ESTA ALDEA","bda":"BLOQUEADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CATARINA LA TINTA","town":"ALDEA PALOMAR Y ALDEAS DESPUÉS DE ESTA (SECUACHIL, SOMPOPERO)","bda":"BLOQUEADO"},{"department":"BAJA VERAPAZ","municipality":"RABINAL","town":"SAN RAFAEL","bda":"HABILITADO"},{"department":"BAJA VERAPAZ","municipality":"RABINAL","town":"PACUX","bda":"BLOQUEADO"},{"department":"BAJA VERAPAZ","municipality":"SAN MIGUEL CHICAJ","town":"SANTA RITA","bda":"HABILITADO"},{"department":"BAJA VERAPAZ","municipality":"SAN MIGUEL CHICAJ","town":"SAN RAFAEL","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"CHICHEN","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"CHICOYOJ","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"CHIJOU","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"CHISACSÍ","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"HOLANDA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"MARIA AUXILIADORA","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"NAJQUITOB","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"TIO GUILO","bda":"HABILITADO"},{"department":"ALTA VERAPAZ","municipality":"SANTA CRUZ VERAPAZ","town":"VALPARAÍSO","bda":"HABILITADO"},{"department":"PETÉN","municipality":"LA LIBERTAD","town":"SAN JUAN VILLA NUEVA","bda":"HABILITADO AM"},{"department":"PETÉN","municipality":"LA LIBERTAD","town":"VILLA HERMOSA","bda":"HABILITADO AM"},{"department":"PETÉN","municipality":"LA LIBERTAD","town":"POZO AZUL","bda":"HABILITADO AM"},{"department":"PETÉN","municipality":"LA LIBERTAD","town":"EL BUEN SAMARITANO","bda":"HABILITADO"},{"department":"PETÉN","municipality":"LA LIBERTAD","town":"EL MANANTIALITO","bda":"BLOQUEADO"},{"department":"PETÉN","municipality":"LA LIBERTAD","town":"SANTIAGUITO","bda":"HABILITADO"},{"department":"PETÉN","municipality":"LAS CRUCES","town":"RETALTECO","bda":"HABILITADO"},{"department":"PETÉN","municipality":"LAS CRUCES","town":"BETHEL","bda":"HABILITADO"},{"department":"PETÉN","municipality":"MELCHOR DE MENCOS","town":"LA BLANCA","bda":"HABILITADO"},{"department":"PETÉN","municipality":"LAS CRUCES","town":"SANTA ROSITA","bda":"BLOQUEADO"},{"department":"PETÉN","municipality":"LAS CRUCES","town":"LOS LAURELES","bda":"BLOQUEADO"},{"department":"PETÉN","municipality":"LAS CRUCES","town":"IXMUCANE","bda":"BLOQUEADO"},{"department":"PETÉN","municipality":"POPTUN","town":"SABANETA TANJOB","bda":"HABILITADO"},{"department":"PETÉN","municipality":"POPTUN","town":"EL CARRIZAL","bda":"HABILITADO AM"},{"department":"PETÉN","municipality":"SAN LUIS","town":"NACIMIENTO MACHAQUILAITO","bda":"BLOQUEADO"},{"department":"PETÉN","municipality":"SAN LUIS","town":"EL NARANJAL","bda":"BLOQUEADO"},{"department":"PETÉN","municipality":"SAYAXCHE","town":"ALDEA NUEVA LIBERTAD","bda":"HABILITADO AM"},{"department":"PETÉN","municipality":"SAN LUIS","town":"CHUNACTE","bda":"HABILITADO AM"},{"department":"HUEHUETENANGO","municipality":"SAN MATEO IXTATAN","town":"RIO SECO","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN MATEO IXTATAN","town":"BELLA LINDA","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN MATEO IXTATAN","town":"FRONTERA","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN MATEO IXTATAN","town":"EL RINCON","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN MATEO IXTATAN","town":"NUEVO SAN MATEO","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN MATEO IXTATAN","town":"YALANHUITZ","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"CANIBAL","bda":"BLOQUEADO / SOLO SE ATIENDE A CLIENTES Y EX CLIENTES"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"ALDEAS DESPUÉS DE CANIBAL CUILCO","bda":"HABILITADO"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"GUACHIPILIN","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"HORNO DE CAL","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"TABLÓN","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA","town":"GUAILA","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA","town":"ALDEA GUACAMAYAS","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA","town":"LA MESILLA (BARRIO LA UNIÓN)","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA","town":"LA MESILLA (BARRIO LA CRUZ)","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA","town":"LA MESILLA (ALDEA VUELTAMINA)","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA","town":"ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO","town":"ZONA 2 FINAL","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO","town":"LOS AGUACATILLOS","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO","town":"CANFCHAC","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO","town":"XEPON","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO","town":"QUILÍN NOVIO","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"HUEHUETENANGO","town":"MIXLAJ","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA BARBARA","town":"XOCONILA J","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN SEBASTIÁN HUEHUETENANGO","town":"TUIXAP","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN SEBASTIÁN HUEHUETENANGO","town":"QUIAJOLA-TUISCAP","bda":"HABILITADO"},{"department":"HUEHUETENANGO","municipality":"TODOS SANTOS CUCHUMATANES","town":"TODOS SANTOS CUCHUMATANES CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"CHIANTLA","town":"ALDEAS DE CHIANTLA","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"CANIBAL","bda":"BLOQUEADO / SOLO SE ATIENE A CLIENTES Y EX CLIENTES"},{"department":"HUEHUETENANGO","municipality":"LA DEMOCRACIA","town":"GUAYLA, LOCALIDADES DESPUÉS DEL CEMENTERIO","bda":"BLOQUEADO, SOLO APLICA CALLE PRINCIPAL QUE DIRIGE DE CAMOJÁ A NENTON"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"ALDEA EL QUETZAL","bda":"BLOQUEADO / SOLO SE ATIENDE A CLIENTES Y EX CLIENTES"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"ALDEA EL LIMÓN","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"ALDEA EL AGUACATE","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"BARRIO FLOR DE MAYO","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"CHACAJ","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"GRACIAS A DIOS","bda":"HABILITADO SOLO CENTRO Y CALLE PRINCIPAL HACIA ALDEA GRACIAS A DIOS, ALDEAS ALEDAÑAS BLOQUEADAS"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"LA FORTUNA","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"LA UNION","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"OJO DE AGUA","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"SANTA ROSA","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"NENTON CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"NENTON","town":"YALAMBOJOCH","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA ANA HUISTA","town":"EL MORRAL","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA ANA HUISTA","town":"LA LAGUNA","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA ANA HUISTA","town":"RINCON TIGRE","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA ANA HUISTA","town":"TEPEGUAJAL","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA ANA HUISTA","town":"ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SANTA ANA HUISTA","town":"AGUA ZARCA","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"COLOTENANGO","town":"COLOTENANGO CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"CONCEPCION HUISTA","town":"CONCEPCION HUISTA CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"CUILCO CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"JACALTENANGO","town":"ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"LA LIBERTAD","town":"LA LIBERTAD CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"PETATAN","town":"PETATAN CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN ANTONIO HUISTA","town":"ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN ILDEFONSO IXTAHUACÁN","town":"SAN ILDEFONSO IXTAHUACÁN CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO NECTA","town":"SAN PEDRO NECTA CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SANTIAGO CHIMALTENANGO","town":"SANTIAGO CHIMALTENANGO CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"UNION CANTINIL","town":"UNION CANTINIL CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"SAN MARCOS","municipality":"MALACATÁN","town":"ALDEA SAN JUAN MIRAMAR","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"MALACATÁN","town":"ALDEA SAN FRANCISCO LA NUEVA REFORMA","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"MALACATÁN","town":"CASERIO BOTRAN","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"MALACATÁN","town":"GEMBLOUX","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"MALACATÁN","town":"ALDEA MALACATANCITO","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"MALACATÁN","town":"CASERIO 20 DE AGOSTO","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"MALACATÁN","town":"SANTA ANA","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA / SAN PABLO","town":"EL MATAZANO","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"SAN ANTONIO","town":"7 TAMBORES","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"SAN PEDRO","town":"PROVINCIA CHIQUITA","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA","town":"EL NARANJO","bda":"HABILITADO, HORARIO AM"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA","town":"LA NUEVA LIBERTAD CHAYEN","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA","town":"EL PLATANILLO","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA","town":"EL MILAGO","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA","town":"EL MARISCAL I Y II","bda":"HABILITADO CALLE PRINCIPAL, BLOQUEADO CALLEJONES"},{"department":"SAN MARCOS","municipality":"SAN RAFAEL PIE DE LA CUESTA","town":"LA LIBERTAD","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMÁ","town":"ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN JUAN IXCOY","town":"ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN MIGUEL ACATÁN","town":"SAN MIGUEL ACATAN CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN SEBASTIAN COATÁN","town":"SAN SEBASTIAN COATAN CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN RAFAEL INDEPENDENCIA","town":"SAN RAFAEL INDEPENDENCIA CENTRO Y ALDEAS ALEDAÑAS","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMÁ","town":"CRINOLINA","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMÁ","town":"LA FLORESTA","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMÁ","town":"POXLAC","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMÁ","town":"SUYIL","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMÁ","town":"SUYILITO","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SAN PEDRO SOLOMÁ","town":"YACXAP","bda":"BLOQUEADO / APLICA ÚNICAMENTE PARA CLIENTES RECURRENTES"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"MOLNA, ALDEAS DESPUES DE MOLNA BLOQUEADO","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"CHOJZUNIL","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"MOLNA","bda":"HORARIO AM"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"YICHON","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"CAPTZIN","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"LAS BRISAS","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"POSHLAC","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"POYLA","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"WAXACOY","bda":"BLOQUEADO"},{"department":"HUEHUETENANGO","municipality":"SANTA EULALIA","town":"LA CRINOLINA","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"SAN MIGUEL IXTAHUACÁN","town":"ALDEAS","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"SAN MIGUEL IXTAHUACÁN","town":"ALDEA SICABE","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"SAN MIGUEL IXTAHUACÁN","town":"ALDEA EL TRIUNFO","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"SAN MIGUEL IXTAHUACÁN","town":"ALDEA MAQUIVIL","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"TACANÁ","town":"TODAS LAS ZONAS Y ALDEAS","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"TAJUMULCO","town":"CHANA","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"TAJUMULCO","town":"TONIMCHUM","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"TAJUMULCO","town":"TOLÁ SECTORES 1,2,3","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"TAJUMULCO","town":"CHANCHICUPE","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"TAJUMULCO","town":"RESTO DE ALDEAS/LOCALIDADES","bda":"BLOQUEADO"},{"department":"SAN MARCOS","municipality":"IXCHIGUÁN","town":"CHOAPEQUEZ","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"IXCHIGUÁN","town":"TUILADRILLO","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"IXCHIGUÁN","town":"BUENOS AIRES","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"IXCHIGUÁN","town":"EL PLAN CALAPTE","bda":"HABILITADO"},{"department":"SAN MARCOS","municipality":"IXCHIGUÁN","town":"RESTO DE ALDEAS/LOCALIDADES","bda":"HABILITADO PARA CLIENTES EN TODOS LOS PERFILES Y NO CLIENTES ÚNICAMENTE PARA PERFIL NORMAL Y PREFERENCIAL"},{"department":"HUEHUETENANGO","municipality":"CUILCO","town":"CANIBAL CUILCO","bda":"BLOQUEADO / SOLO SE ATIENDE A CLIENTES Y EX CLIENTES"},{"department":"SAN MARCOS","municipality":"COMITANCILLO","town":"CHAMAQUE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"BAJOS DE SAN JORGE","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"CERRO CORADO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL CERRITO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL PROGRESO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL PROGRESO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RELLENO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCÓN","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL TRIUNFO I","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL TRIUNFO II","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"JIREH","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"LAS TROJES","bda":"HABILITADO AM HASTA LA ESCUELA"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"LLANOS DE ANIMAS","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"LOMA LARGA ALTOS DE LA CRUZ","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"MESILLAS ALTAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"MESILLAS BAJAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL DURAZNO","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"LAGUNA SECA","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"SAN ANTONIO EL PEPINAL","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"ALDEA SAN JOSÉ HUMITOS","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"SAN JORGE","bda":"HABILITADO HASTA LA TERRACERÍA"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/EL ARENAL","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/ LOS CEDROS","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON DE LOS PEREZ PINTO","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCONCITO","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/EL CEDRAL","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/LA ISLA","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/LA ESMERALDA","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/RESIDENCIAL VALLES DEL RINCON","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/SAN JUAN BAUTISTA 3","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"EL RINCON/EL CAFETALITO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"LLANO DE ANIMAS/EL CERRO DEL LLANO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"AMATITLÁN","town":"AGUA DE LAS MINAS","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"10 DE FEBRERO TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"ARNOLDO MEDRANO TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"ASENTAMIENTO MITCH TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"CUMBRE DEL DURAZNO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"EL DURAZNO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"LA BENDICIÓN TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"LA ISLA TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"LOS EUCALIPTOS TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"MARANATHA TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"NUEVO AMANECER TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"VIDA NUEVA TIERRA NUEVA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"SAN MARTIN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"TIERRA NUEVA II ÁREA CENTRAL","bda":"HORARIO AM"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"TRES SABANAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"ASENTAMIENTO 20 DE OCTUBRE / ASUNCIÓN 20 DE OCTUBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"EL PARAÍSO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"JOYA SAN RAFAEL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"JOYA TECÚN UMÁN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"SAN JULIÁN","bda":"BLOQUEADO. EXCEPTO DEL SECTOR 1 AL SECTOR 7 SOLO CALLES PRINCIPALES."},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"SANTA FAZ","bda":"HORARIO AM"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"SANTA MARTA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"SENAHÚ I","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"SENAHÚ II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"EL JOCOTE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"CHINAUTLA","town":"SAUZAL","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LUZ DE LA MAÑANA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"10 DE MAYO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"5 DE OCTUBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ANEXO LOS ÁNGELES 1 Y 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BARRANQUILLA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLINAS I Y II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL ADMINISTRADOR","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL ROBLE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL TUERTO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"JIREH","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOS REYES","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ZONA 1","bda":"BLOQUEO PARCIAL (BLOQUEADO DE LA FINAL DE LA 15 CALLE Y 15 CALLE A, CALLEJONES ALEDAÑOS)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ZONA 1","bda":"BLOQUEADO ASENTAMIENTOS"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA ISLA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"PLAZA DE TOROS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA SANTA FE","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA LAS VACAS","bda":"HABILITADO CALLE PRINCIPAL SOLO HORARIO AM, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"3 DE MAYO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ALAMEDA NORTE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. 3 DE MARZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. CANDELARIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. CIPRESALES","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. EL CERRITO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CERRITO - ANEXO SAN LUIS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CERRITO - INDEPENDENCIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CERRITO - LA LOMA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CERRITO - LA BOMBA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CERRITO - LAS VICTORIAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. EMANUEL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. ESQUIPULAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. HOLANDA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. ITALIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. LAS CHAMPAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. PARQUECITO COMUNAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BARRIO COLOMBIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COMUNIDAD ARZU","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL COMUNAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL LIMÓN","bda":"HABILITADO AM SOLO LA CALLE PRINCIPAL DEL MERCADO, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL LIMON 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA ESPERANZA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA LOMA PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENTAMIENTO TIERRA PROMETIDA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA RATONERA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS CHAMPAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS ILUSIONES","bda":"BLOQUEO PARCIAL SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOMAS DE SANTA FAZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOTIFICACIÓN VILLAS DEL EDEN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"NUEVA JERUSALÉN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"PARAÍSO III","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SAN RAFAEL II","bda":"BLOQUEO PARCIAL (HABILITADO DE LA 12 AV. DE LA 9 CALLE A LA 10 CALLE)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SAN RAFAEL LAS COLINAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SAN RAFAEL LA LAGUNA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"NAZARET","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"15 DE DICIEMBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA BOMBA PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL EDEN PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL MIRADOR PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LUZ Y ESPERANZA PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS LADERAS PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS MARINAS PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS PUERTAS DEL JARDIN PARAISO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENT. EL BOSQUE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA RENACIMIENTO MUNICIPAL","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA LOMAS DE LA BARREDA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LO DE RODRIGUEZ","bda":"BLOQUEO PARCIAL (HABILITADO SECTOR 1, 2 Y 3 (SOLO HORARIO AM))"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ALAMEDA 1","bda":"BLOQUEO PARCIAL HABILITADO EN HORARIO AM, DE LA 17 AVENIDA A LA 25 AVENIDA, 14 CALLE Y 15 CALLE, SOBRE CALLE PRINCIPAL SIN INGRESAR A CALLEJONES ."},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ALAMEDA 2","bda":"BLOQUEO PARCIAL HABILITADO EN HORARIO AM, DE LA 17 AVENIDA A LA 25 AVENIDA, 14 CALLE Y 15 CALLE, SOBRE CALLE PRINCIPAL SIN INGRESAR A CALLEJONES ."},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ALAMEDA 3","bda":"BLOQUEO PARCIAL HABILITADO EN HORARIO AM, DE LA 17 AVENIDA A LA 25 AVENIDA, 14 CALLE Y 15 CALLE, SOBRE CALLE PRINCIPAL SIN INGRESAR A CALLEJONES ."},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ALAMEDA 4","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CERRITO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL PARAISO 1","bda":"HABILITADO AM SOLO CALLE PRINCIPAL (12 CALLE)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS TAPIAS","bda":"HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LO DE RODRÍGUEZ","bda":"BLOQUEO PARCIAL (HABILITADO EL SECTOR 1, 2 Y 3 (SOLO HORARIO AM))"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOMAS LA BARREDA","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL PARAISO 2","bda":"BLOQUEO PARCIAL HABILITADO EN HORARIO AM, SOLO CALLE PRINCIPAL DE LA 8 CALLE A LA 12 CALLE, 25 Y 26 AVENIDA, SIN INGRESAR A CALLEJONES."},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SAN RAFAEL 3","bda":"BLOQUEO PARCIAL, HORARIO AM (BLOQUEADO COLINAS III ANEXO LAS TORRES)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL ROSARIO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ANEXO EL ROSARIO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS MONJITAS","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BARRIO MODERNO","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENTAMIENTO LA ARENERA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENTAMIENTO NUEVO AMANECER","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SANTA MARIA DE LA PAZ I","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SANTA MARIA DE LA PAZ II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SANTA MARÍA DE LA PAZ III","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOMA BLANCA","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOS BARBEROS/SECTOR BARBEROS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"FINCA RODRIGUEZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA HONDONADA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"14 DE OCTUBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COMUNIDAD LA PAZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL GALLITO","bda":"HABILITADO AM SOLO 12 Y 13 CALLE PRINCIPAL HASTA EL MERCADO, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL INCIENSO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL PALMAR","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL RECUERDO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL RELLENO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA LIBERTAD","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA RUEDITA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA TRINIDAD","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS CALAVERAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"NUEVO AMANECER","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ORALIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ZONA 3","bda":"BLOQUEO PARCIAL (BLOQUEADO COLINDANCIAS AL BASURERO Y CALLES ALEDAÑAS)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA ARGUETA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"15 DE AGOSTO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"5 DE OCTUBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL EDEN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL LIMONCITO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA FUENTE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA LIMONADA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA PALMITA","bda":"BLOQUEO PARCIAL (BLOQUEADO DE LA 18 AV. A LA 22 AV. Y CALLES ALEDAÑAS A LA LIMONADA)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOURDES","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"19 DE MAYO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"3 DE MAYO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ANEXO BARRIO SAN ANTONIO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ANEXO SAN JUAN DE DIOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BERGER I","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BERGER II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BUENA VISTA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"DIVINA PASTORA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL BOSQUE BARRIO SAN ANTONIO","bda":"HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CARMEN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CARMEN 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL QUINTANAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"JESUS DE LA BUENA ESPERANZA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA PAZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LOS POCITOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"MONROY Y BOSQUE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"NUEVA JERUSALÉN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"PROYECTO EL CARMEN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SANTIAGO DE LOS CABALLEROS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"TECUN UMAN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ZONA 6","bda":"BLOQUEADO TODOS LOS ASENTAMIENTOS BAJO EL PUENTE BELICE"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA MARTINICO","bda":"BLOQUEO PARCIAL (HABILITADO DE LA 9 AVENIDA A LA 13 AVENIDA (SOLO HORARIO AM))"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA 30 DE JUNIO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA SAN JUAN DE DIOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA NORUEGA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"10 D MAYO ANEXO AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"21 DE NOVIEMBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"24 DE DICIEMBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"26 DE JULIO AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"28 DE JULIO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"4 DE AGOSTO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"4 DE FEBRERO","bda":"HABILITADO SOLO 30 AVENIDA SOLO CALLES PRINCIPALES EN HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"6 DE AGOSTO GRANIZO 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ALFA NUEVA GENERACIÓN AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ANEXO 4 DE FEBRERO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ANEXO MARIO JULIO SALAZAR","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BETHANIA","bda":"SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BETHANIA II","bda":"SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"BRISAS DEL CAMPO AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL CERRITO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL GRANIZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL GRANIZO I","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL GRANIZO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL GRANIZO III","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL TANQUE BETHANIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL UNIVERSO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EMANUEL AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"JOSUÉ 1:9","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA ESPERANZA LA AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA JOYITA AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA VERBENA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA VERBENA LA JOYA 1","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA VERBENA LA JOYA 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA VERBENA LA JOYA 3","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA VERBENA LA JOYA 4","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LA VERBENA LA JOYA 5","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS MARGARITAS BETHANIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LAS TORRES","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"LEON DE JUDA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"MADRE DORMIDA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"MARIA TERESA CABALLERO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA MARIO JULIO SALAZAR","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENTAMIENTO MARIO JULIO SALAZAR","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"MARTÍNEZ DE LEJARZA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"MIRADOR AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"NUEVO AMANECER","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"PRIMAVERA AMPARO 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"REGALO DE DIOS AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SAN FRANCISCO DE ASIS","bda":"SOLO CALLES PRINCIPALES EN HORARIO AM, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SANTA RITA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SECTOR LA ISLA GRANIZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"SHELL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"VERBENA RANCHERÍA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"WENDY BERGER","bda":"BLOQUEO PARCIAL (HABILITADO CALLES PRINCIPALES (HORARIO AM))"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA EL AMPARO 1","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA EL AMPARO 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA NIÑO DORMIDO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA EL INCIENSO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA OTTEN PRADO","bda":"SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA SAKERTY 1","bda":"SOLO HORARIO AM ( SOLO APLICA CALLE PRINCIPAL NO APLICAN CALLEJONES)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA SAKERTY 2","bda":"SOLO HORARIO AM ( SOLO APLICA CALLE PRINCIPAL NO APLICAN CALLEJONES)"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA TECUN UMAN","bda":"SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA TECUN UMAN I","bda":"SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA TECUN UMAN II","bda":"SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"COLONIA TECUN UMAN III","bda":"SOLO HORARIO AM"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"6 DE OCTUBRE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"ASENTAMIENTO GALILEA / ANEXO AMPARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"GUATEMALA","town":"EL INFIERNITO","bda":"BLOQUEO PARCIAL (BLOQUEADO DE LA 36 Y 37 CALLE 8 Y 9 AV.)"},{"department":"GUATEMALA","municipality":"MIXCO","town":"MUNICIPAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"MIXCO","town":"TIERRA BLANCA O RÍO SECO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"MIXCO","town":"ASENTAMIENTO EL HOYO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"MIXCO","town":"CAROLINGIA","bda":"HABILITADO AM SOLO CALLE PRINCIPAL QUE DIRIGE A COLONIA EL MILAGRO, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"MIXCO","town":"CAROLINGIA I","bda":"HABILITADO HORARIO AM SOLO 29 CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"MIXCO","town":"CAROLINGIA II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"MIXCO","town":"LO DE BRAN III","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"MIXCO","town":"SACOJ CHIQUITO","bda":"HABILITADO HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"MIXCO","town":"SACOJ GRANDE","bda":"HABILITADO HORARIO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"MIXCO","town":"SAN JOSECITO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"MIXCO","town":"EL MILAGRO","bda":"BLOQUEO PARCIAL (BLOQUEADO DE LA CH - ZZ - (X ANEXOS AL MILAGRO))"},{"department":"GUATEMALA","municipality":"MIXCO","town":"CIUDAD SATÉLITE","bda":"BLOQUEADO * LA ISLA, LADERAS Y BARRANCOS"},{"department":"GUATEMALA","municipality":"MIXCO","town":"EL AGUACATE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"MIXCO/CHINAUTLA","town":"VILLAS DEL MILAGRO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"MIXCO/CHINAUTLA","town":"BRISAS DEL MILAGRO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"MIXCO/CHINAUTLA","town":"PLANES DEL MILAGRO","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"PALENCIA","town":"ALDEA EL TRIUNFO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"PALENCIA","town":"ALDEA EL SOCORRO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"PALENCIA","town":"ALDEA AGUA TIBIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"PALENCIA","town":"CANTON AGUA TIBIA","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"SAN JOSÉ PINULA","town":"CARRETERA HACIA MATAQUESCUINTLA","bda":"BLOQUEO PARCIAL (HABILITADO CALLE ASFALTADA - BLOQUEADO TERRACERÍA)"},{"department":"GUATEMALA","municipality":"SAN JOSÉ PINULA","town":"EL CEDRITO ALDE LAS NUBES","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN JOSÉ PINULA","town":"ALDEA CONCEPCION PINULA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SANTA CATARINA PINULA","town":"SECTOR EL CERRITO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN MIGUEL PETAPA","town":"CALLEJÓN GALIZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN MIGUEL PETAPA","town":"CERRITO DE SANTA INES","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"ALTOS DE SANTA MARÍA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"BRISAS DE SAN PEDRO I","bda":"HORARIO AM, SE TRABAJARÁ ÚNICAMENTE CALLE PRINCIPAL DEL SUPERMERCADO SUMA Y CALLE DEL MERCADO HASTA LA CUCHILLA DONDE ESTA EL POZO LOMAS DE SAN JOSÉ 1"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"BRISAS DE SAN PEDRO II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"CHAN 1 Y 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"CUMBRE DEL GUAYABO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"JUAN GERARDI","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LOS ALTARCITOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"SAN JOSÉ NACAHUIL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"PRADOS DE LA LAGUNILLA","bda":"HABILITADO EN HORARIO AM, 1 CUADRA ANTES DE LA BOMBA DE AGUA. (HASTA LA 8AV. MANZANA 15)"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LA LEYENDA SECTOR 1 Y SECTOR 2","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LOMAS DE SAN JOSÉ","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"EL CARRIZAL","bda":"HABILITADO, SE ATIENDEN VERIFICACIONES HASTA LAS 15:00 PM"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"VISTAS DE SAN LUIS SECTOR 1 Y 2","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LLANOS DE SANTA MARIA 1","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LA JULIETA","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LOTIFICACIÓN CANAÁN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LOS VADOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"SAN PEDRO AYAMPUC","town":"LA CRUZ DE LOS VADOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"SANTA ELENA BARILLAS EL JOCOTILLO","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"SANTA ELENA BARILLAS ALDEA LOS DOLORES","bda":"HABILITADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"CERRITOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"EL ZAPOTE","bda":"HABILITADO HORARIO AM, SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"EL ARENAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"MONJA BLANCA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"RUSTRIÁN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"CERRITOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"PORVENIR EL CENTRO","bda":"HABILITADO AM SOLO CALLE PRINCIPAL HASTA LA ESTACIÓN DE BUSES, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"EL PORVENIR","bda":"HABILITADO HORARIO AM, SOLO CALLE PRINCIPAL HASTA LA ESTACIÓN DE BUSES, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"BOCA DEL MONTE COLONIA SANTA ANITA","bda":"BLOQUEO PARCIAL (HABILITADO DE LA 1 CALLE A 4 CALLE Y 4 AVENIDA A 6 AVENIDA SOBRE CALLES PRINCIPALES, NO CALLEJONES (HORARIO AM)"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"BOCA DEL MONTE COLONIA EL ROSARIO","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"EL PORVENIR","bda":"HABILITADO AM SOLO CALLE PRINCIPAL HASTA LA ESTACIÓN DE BUSES, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"EL PORVENIR SECTOR LA PEDRERA Y EL CEMENTERIO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"SANTA GERTRUDIS 2","bda":"HABILITADO AM SOLO CALLE PRINCIPAL ASFALTADA, NO APLICAN CALLEJONES Y CALLES DE TERRACERÍA"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"BELLO ATARDECER/CHICHIMECAS","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"ALDEA CHICHIMECAS","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"CALLEJONES DE LÍNEA FÉRREA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"ALDEA EL PORVENIR SECTOR LA PEDRERA Y EL CEMENTERIO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"SANTA GERTRUDIS 1","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"BELLO ATARDECER/CHICHIMECAS","bda":"BLOQUEO PARCIAL (HABILITADO EL SECTOR LA BOMBA EN HORARIO AM)"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"EL ZAPOTE","bda":"BLOQUEO PARCIAL (HABILITADO CALLE PRINCIPAL ASFALTADA)"},{"department":"GUATEMALA","municipality":"VILLA CANALES","town":"ALDEA EL PORVENIR CENTRO","bda":"HABILITADO AM SOLO CALLE PRINCIPAL HASTA LA ESTACIÓN DE BUSES, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"PLAN GRANDE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"8 DE MARZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ANEXO EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ANEXO MEZQUITAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"CIUDAD REAL II","bda":"HABILITADO AM HASTA EL CAMPO DE FUTBOL, (BLOQUEADO LÍNEA FÉRREA, SECTORES Y LOTES)"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"EL BÚCARO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"EL MEZQUITAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"GRANJA GUTIÉRREZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"JOYA DEL MEZQUITAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LA ESPERANZA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LA ISLA VILLA LOBOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LAS MARGARITAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"MONTE DE LOS OLIVOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"NUEVA ESPERANZA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"TIERRA SANTA 1 Y 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"TRES BANDERAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"UNIDOS POR LA PAZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VISTA AZUL VILLA LOBOS II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VILLA LOBOS III","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VILLA LOBOS I","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ANEXO VILLALOBOS 2","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"EL ÉXODO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LUZ DE CRISTO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ANEXO EL ÉXODO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ASENTAMIENTO LA UNION","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ASENTAMIENTO PATRICIA DE ARZU","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LOMAS DE VILLA LOBOS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VILLA LOBOS 2","bda":"BLOQUEO PARCIAL (EXCEPTO CALLE PRINCIPAL HASTA 3 AVENIDA Y 54 CALLE, SOLO CALLE PRINCIPAL NO CALLEJONES, HORARIO AM)"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"COLONIA CANDELARIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"AMPLIACIÓN SOLANO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ANIBAL ARCHILA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"CARMEN DEL MONTE","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"SANTA ISABEL 2","bda":"BLOQUEADO * ANEXOS ALEDAÑOS, ANEXO EMANUEL, SECTOR DEL 21 AL 24 Y NO CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"SANTA ISABEL 1","bda":"BLOQUEADO CALLEJONES Y CALLES SIN ASFALTO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ANEXO EL ESFUERZO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LAS VICTORIAS - PARTE ALTA MARIO ALIOTO","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LAS VICTORIAS","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ALTOS DE PRIMAVERA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"BRISAS DEL LAGO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LA PAZ","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"MÁRTIRES DEL PUEBLO","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VALLE DE NAZARETH","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"COLONIA MARIO ALIOTO PLANTA ALTA","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ASENTAMIENTO PRIMAVERA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"MARIANITA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"14 DE JUNIO CIUDAD PERONIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"15 DE JULIO CIUDAD PERONIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"26 DE JUNIO CIUDAD PERONIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"30 DE JUNIO CIUDAD PERONIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"30 DE NOVIEMBRE CIUDAD PERONIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"EL GRAN MIRADOR","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LA ROTONDA TERRAZAS III","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"NUEVA ESPERANZA PERONIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"NUEVO AMANECER","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"OASIS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"TERRAZAS DE SAN CRISTÓBAL II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"TERRAZAS II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"EL MIRADOR DE SAN CRISTÓBAL","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"TERRAZAS DE SAN CRISTÓBAL I","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"TERRAZAS DE SAN CRISTÓBAL III","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VILLAS DEL AMANECER","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VILLAS DEL AMANECER I","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"VILLAS DEL AMANECER II","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"CIUDAD PERONIA","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"RESIDENCIALES JERUSALÉN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ALDEA EL TABLÓN","bda":"HORARIO AM"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"BRISAS DE BÁRCENAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LAS NUBES BÁRCENAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"ASENTAMIENTO PLATANITO BÁRCENAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LOS OLIVOS BÁRCENAS","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"LA BENDICIÓN DE DIOS 1 Y 2","bda":"HABILITADO AM"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"REGALITO DE DIOS /LOS CEDROS","bda":"HABILITADO AM SOLO CALLE PRINCIPAL, NO APLICAN CALLEJONES"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"El TABLÓN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"HUERTAS","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"JARDIN DEL EDEN","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"FINCA PARAISO","bda":"BLOQUEADO"},{"department":"GUATEMALA","municipality":"VILLA NUEVA","town":"CASERIO EL CALVARIO","bda":"BLOQUEADO"}]};



// -----------------------------
// PROTECCIÓN DE CUOTA R2
// Cortacircuito interno al 80% del nivel gratuito de R2 Standard.
// Se usa una ventana móvil de 31 días para operaciones y un contador
// conservador de bytes almacenados por esta aplicación.
// -----------------------------
const R2_QUOTA_DEFAULTS = {
  storage_bytes: 8_000_000_000, // 80% de 10 GB
  class_a_31d: 800_000,         // 80% de 1,000,000
  class_b_31d: 8_000_000        // 80% de 10,000,000
};
const R2_QUOTA_PREFIX = "quota:r2:";

function r2QuotaLimits(env) {
  const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };
  return {
    storage_bytes: num(env.R2_MAX_STORAGE_BYTES, R2_QUOTA_DEFAULTS.storage_bytes),
    class_a_31d: num(env.R2_MAX_CLASS_A_31D, R2_QUOTA_DEFAULTS.class_a_31d),
    class_b_31d: num(env.R2_MAX_CLASS_B_31D, R2_QUOTA_DEFAULTS.class_b_31d)
  };
}

function r2QuotaEnabled(env) {
  return String(env.R2_QUOTA_ENABLED ?? "true").toLowerCase() !== "false";
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function recentUtcDays(count = 31) {
  const out = [];
  const now = new Date();
  now.setUTCHours(0,0,0,0);
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    out.push(utcDayKey(d));
  }
  return out;
}

async function getR2QuotaUsage(env) {
  const limits = r2QuotaLimits(env);
  if (!env.CREDIZAS_KV) {
    return { ok:false, blocked:true, reason:"CREDIZAS_KV no disponible para controlar la cuota R2.", limits, storage_bytes:0, class_a_31d:0, class_b_31d:0 };
  }
  const storage = await kvGetJson(env, R2_QUOTA_PREFIX + "storage") || { bytes:0 };
  let classA = 0, classB = 0;
  for (const day of recentUtcDays(31)) {
    const row = await kvGetJson(env, R2_QUOTA_PREFIX + "day:" + day);
    if (!row) continue;
    classA += Number(row.class_a || 0);
    classB += Number(row.class_b || 0);
  }
  const storageBytes = Math.max(0, Number(storage.bytes || 0));
  const blocked = storageBytes >= limits.storage_bytes || classA >= limits.class_a_31d || classB >= limits.class_b_31d;
  return {
    ok:true, blocked,
    reason: blocked ? "R2 bloqueado preventivamente: se alcanzó el límite interno de seguridad (80%)." : null,
    storage_bytes: storageBytes,
    class_a_31d: classA,
    class_b_31d: classB,
    pct_storage: Math.min(100, storageBytes / limits.storage_bytes * 80),
    pct_class_a: Math.min(100, classA / limits.class_a_31d * 80),
    pct_class_b: Math.min(100, classB / limits.class_b_31d * 80),
    limits
  };
}

async function reserveR2Usage(env, { class_a = 0, class_b = 0, storage_delta = 0 } = {}) {
  if (!r2QuotaEnabled(env)) return { ok:true, disabled:true };
  const usage = await getR2QuotaUsage(env);
  if (!usage.ok) return usage;
  const next = {
    storage_bytes: Math.max(0, usage.storage_bytes + Number(storage_delta || 0)),
    class_a_31d: usage.class_a_31d + Number(class_a || 0),
    class_b_31d: usage.class_b_31d + Number(class_b || 0)
  };
  if (next.storage_bytes > usage.limits.storage_bytes) return { ok:false, blocked:true, reason:"R2 detenido: el almacenamiento alcanzaría el 80% de la cuota gratuita.", usage, next };
  if (next.class_a_31d > usage.limits.class_a_31d) return { ok:false, blocked:true, reason:"R2 detenido: las operaciones Clase A alcanzarían el 80% de la cuota gratuita.", usage, next };
  if (next.class_b_31d > usage.limits.class_b_31d) return { ok:false, blocked:true, reason:"R2 detenido: las operaciones Clase B alcanzarían el 80% de la cuota gratuita.", usage, next };

  const dayKey = R2_QUOTA_PREFIX + "day:" + utcDayKey();
  const day = await kvGetJson(env, dayKey) || { class_a:0, class_b:0 };
  day.class_a = Number(day.class_a || 0) + Number(class_a || 0);
  day.class_b = Number(day.class_b || 0) + Number(class_b || 0);
  day.updated_at = new Date().toISOString();
  await kvPutJson(env, dayKey, day, { expirationTtl: 40 * 86400 });

  if (storage_delta) {
    await kvPutJson(env, R2_QUOTA_PREFIX + "storage", { bytes:next.storage_bytes, updated_at:new Date().toISOString() });
  }
  return { ok:true, usage:next, limits:usage.limits };
}

function r2QuotaBlockedResponse(result) {
  return json({
    ok:false,
    error: result?.reason || "R2 bloqueado por protección de cuota.",
    code:"R2_QUOTA_GUARD",
    quota: result?.usage || result?.next || null
  }, 507);
}

// -----------------------------
// CAMPOS ETAPA 1: PRECALIFICACIÓN
// Solo identidad extraíble del DPI.
// Los demás datos se completan/revisan manualmente en la interfaz.
// -----------------------------
const STAGE1_FIELDS = [
  ["datos_basicos.nombre_completo", "Nombre completo"],
  ["datos_basicos.numero_dpi", "Número de DPI"],
  ["datos_basicos.fecha_nacimiento", "Fecha de nacimiento"],
  ["datos_basicos.nit", "NIT, solo si aparece explícitamente"],
  ["datos_basicos.estado_civil", "Estado civil, solo si aparece explícitamente en el DPI"],
  ["datos_basicos.nombre_conyuge", "Nombre del cónyuge (si aplica), solo si aparece explícitamente"],
  ["datos_basicos.genero", "Género, únicamente si aparece escrito explícitamente en el DPI"]
];

const STAGE1_KEYS = STAGE1_FIELDS.map(x => x[0]);

const STAGE1_SCHEMA = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file_index: { type: "integer" },
          side: { type: "string", enum: ["anverso", "reverso", "no_determinado"] },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["file_index", "side", "confidence"],
        additionalProperties: false
      }
    },
    dpi_quality: {
      type: "object",
      properties: {
        anverso_legible: { type: "boolean" },
        reverso_legible: { type: "boolean" },
        vigencia: {
          type: "string",
          enum: ["vigente", "vencido", "no_determinado"]
        },
        estado_visual: {
          type: "string",
          enum: ["adecuado", "danado", "no_determinado"]
        },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["anverso_legible", "reverso_legible", "vigencia", "estado_visual", "notes"],
      additionalProperties: false
    },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: STAGE1_KEYS },
          value: { type: ["string", "null"] },
          normalized_value: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source_files: { type: "array", items: { type: "integer" } },
          status: { type: "string", enum: ["found", "uncertain", "conflict"] },
          notes: { type: ["string", "null"] }
        },
        required: [
          "key","value","normalized_value","confidence",
          "source_files","status","notes"
        ],
        additionalProperties: false
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["documents", "dpi_quality", "fields", "warnings"],
  additionalProperties: false
};

// -----------------------------
// CAMPOS ETAPA 2: DOCUMENTOS + RESTO DEL FORMULARIO
// No repetir campos ya capturados en la Etapa 1.
// -----------------------------
const STAGE2_FIELDS = [
  ["domicilio.direccion_completa", "Dirección completa del domicilio"],
  ["digitacion.nombre_empresa", "Nombre de empresa / institución"],
  ["digitacion.giro_oficio", "Giro comercial / actividad / oficio"],
  ["digitacion.direccion_empresa", "Dirección de empresa / negocio / actividad"],
  ["digitacion.telefono_empresa", "Teléfono de empresa / negocio / actividad"],
  ["digitacion.antiguedad", "Antigüedad laboral / negocio / oficio / remesas"]
];

const STAGE2_KEYS = STAGE2_FIELDS.map(x => x[0]);

const STAGE2_SCHEMA = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file_index: { type: "integer" },
          group: { type: "string", enum: ["selfie", "domicilio", "ingresos"] },
          document_type: {
            type: "string",
            enum: [
              "selfie_con_dpi",
              "recibo_luz",
              "recibo_agua",
              "constancia_municipal",
              "constancia_laboral",
              "carta_ingresos",
              "boleta_pago",
              "constancia_jubilacion",
              "constancia_ingresos_independiente",
              "otro",
              "no_identificado"
            ]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["file_index", "group", "document_type", "confidence"],
        additionalProperties: false
      }
    },
    selfie_check: {
      type: "object",
      properties: {
        persona_visible: { type: "boolean" },
        dpi_visible_junto_al_rostro: { type: "boolean" },
        texto_dpi_comparable: {
          type: "string",
          enum: ["coincide", "no_coincide", "insuficiente"]
        },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["persona_visible", "dpi_visible_junto_al_rostro", "texto_dpi_comparable", "notes"],
      additionalProperties: false
    },
    domicile_consistency: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["consistent", "possible_conflict", "insufficient"] },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["status", "notes"],
      additionalProperties: false
    },
    income_consistency: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["consistent", "possible_conflict", "insufficient", "not_applicable"] },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["status", "notes"],
      additionalProperties: false
    },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: STAGE2_KEYS },
          value: { type: ["string", "null"] },
          normalized_value: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source_files: { type: "array", items: { type: "integer" } },
          status: { type: "string", enum: ["found", "uncertain", "conflict"] },
          notes: { type: ["string", "null"] }
        },
        required: ["key", "value", "normalized_value", "confidence", "source_files", "status", "notes"],
        additionalProperties: false
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["documents", "selfie_check", "domicile_consistency", "income_consistency", "fields", "warnings"],
  additionalProperties: false
};

// -----------------------------
// UTILIDADES HTTP / ARCHIVOS
// -----------------------------
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function html(body) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin"
    }
  });
}

function getOpenAIKey(env) {
  let key = String(env.OPENAI_API_KEY || "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/^Bearer\s+/i, "").trim();
  if (!key) throw new Error("OPENAI_API_KEY no está configurada.");
  return key;
}

function bytesToBase64(bytes) {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

function extensionOf(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function inferMime(file) {
  if (file.type) return file.type;
  const ext = extensionOf(file.name);
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text", txt: "text/plain"
  };
  return map[ext] || "application/octet-stream";
}

function isDirectImage(file) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(inferMime(file));
}

function isPdf(file) {
  return inferMime(file) === "application/pdf";
}

async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${inferMime(file)};base64,${bytesToBase64(bytes)}`;
}

async function appendFileToOpenAIContent(content, file, label, env) {
  content.push({
    type: "input_text",
    text: label
  });

  const dataUrl = await fileToDataUrl(file);
  const mime = inferMime(file);

  if (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif"
  ) {
    const imageDetail =
      env && env.IMAGE_DETAIL
        ? env.IMAGE_DETAIL
        : "high";

    content.push({
      type: "input_image",
      image_url: dataUrl,
      detail: imageDetail
    });

    return;
  }

  const fileItem = {
    type: "input_file",
    filename: file && file.name ? file.name : "documento",
    file_data: dataUrl
  };

  if (mime === "application/pdf") {
    fileItem.detail =
      env && (env.PDF_DETAIL || env.IMAGE_DETAIL)
        ? (env.PDF_DETAIL || env.IMAGE_DETAIL)
        : "high";
  }

  content.push(fileItem);
}

function extractOutputText(apiResult) {
  const parts = [];
  for (const item of apiResult.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

function assertSupportedFiles(files, { imagesOnly = false, maxFiles = 6, maxEachMB = 12, maxTotalMB = 30 } = {}) {
  if (!files.length) throw new Error("No se recibieron archivos.");
  if (files.length > maxFiles) throw new Error(`Máximo ${maxFiles} archivos.`);

  const allowedMime = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf", "text/rtf", "application/vnd.oasis.opendocument.text", "text/plain"
  ]);
  const allowedExt = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx", "rtf", "odt", "txt"]);

  let total = 0;
  for (const f of files) {
    const mime = inferMime(f);
    const ext = extensionOf(f.name);
    if (imagesOnly && !isDirectImage(f)) throw new Error(`${f.name}: para DPI utiliza una imagen JPG, PNG, WEBP o GIF.`);
    if (!allowedMime.has(mime) && !allowedExt.has(ext)) throw new Error(`Formato no permitido: ${f.name}`);
    if (f.size > maxEachMB * 1024 * 1024) throw new Error(`${f.name} supera ${maxEachMB} MB.`);
    total += f.size;
  }
  if (total > maxTotalMB * 1024 * 1024) throw new Error(`La carga total supera ${maxTotalMB} MB.`);
}

// -----------------------------
// OPENAI RESPONSES
// -----------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchOpenAIWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callStructuredOpenAI({
  env,
  content,
  schema,
  schemaName,
  maxOutputTokens = 2500,
  timeoutMs = 90000
}) {
  const body = {
    model: env.OPENAI_MODEL || MODEL_DEFAULT,
    store: false,
    reasoning: { effort: "none" },
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    },
    max_output_tokens: maxOutputTokens
  };

  const requestOptions = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getOpenAIKey(env)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };

  const retryableStatuses = new Set([408, 409, 500, 502, 503, 504, 520, 522, 524]);
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let r;

    try {
      r = await fetchOpenAIWithTimeout(
        "https://api.openai.com/v1/responses",
        requestOptions,
        timeoutMs
      );
    } catch (err) {
      const timedOut =
        err?.name === "AbortError" ||
        String(err?.message || err || "").toLowerCase().includes("timeout");

      lastError = new Error(
        timedOut
          ? `OpenAI tardó más de ${Math.round(timeoutMs / 1000)} segundos.`
          : `No se pudo conectar con OpenAI: ${err?.message || err}`
      );

      if (attempt < 2) {
        await sleep(800);
        continue;
      }

      throw lastError;
    }

    const raw = await r.text();
    const data = safeJsonParse(raw);
    const requestId = r.headers.get("x-request-id") || null;

    if (r.ok) {
      if (!data) {
        throw new Error(
          `OpenAI respondió HTTP ${r.status}, pero la respuesta no era JSON.` +
          (requestId ? ` Request ID: ${requestId}.` : "")
        );
      }

      const out = extractOutputText(data);
      if (!out) {
        throw new Error(
          "OpenAI no devolvió datos estructurados." +
          (requestId ? ` Request ID: ${requestId}.` : "")
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        throw new Error(
          "OpenAI respondió, pero el contenido estructurado no pudo convertirse a JSON." +
          (requestId ? ` Request ID: ${requestId}.` : "")
        );
      }

      return {
        parsed,
        request_id: requestId
      };
    }

    const apiMessage =
      data?.error?.message ||
      data?.message ||
      raw?.trim()?.slice(0, 500) ||
      `HTTP ${r.status}`;

    if (r.status === 401) {
      throw new Error("OpenAI rechazó la API key. " + apiMessage);
    }

    if (r.status === 429) {
      throw new Error("OpenAI reportó límite/cuota. " + apiMessage);
    }

    lastError = new Error(
      `OpenAI devolvió HTTP ${r.status}: ${apiMessage}` +
      (requestId ? ` | Request ID: ${requestId}` : "")
    );

    if (attempt < 2 && retryableStatuses.has(r.status)) {
      await sleep(1000);
      continue;
    }

    throw lastError;
  }

  throw lastError || new Error("Error desconocido consultando OpenAI.");
}


function getIncomeSupportPolicy(source, origin, subtype) {
  const s = String(source || "").trim().toUpperCase();
  const o = String(origin || "").trim().toUpperCase();

  if (s === "SALARIO" && o === "SALARIO FORMAL") {
    return {
      required: true,
      code: "SALARIO_FORMAL_REQUIERE_SUSTENTO",
      title: "Debes pedir sustento de ingresos",
      guidance: "Pide constancia o carta laboral, boleta de pago u otro documento que confirme el empleo y el ingreso."
    };
  }

  if (s === "SALARIO" && o === "SALARIO INFORMAL") {
    return {
      required: false,
      code: "SALARIO_INFORMAL_SIN_CONSTANCIA",
      title: "No necesitas pedir constancia de ingresos",
      guidance: "Continúa con los datos de actividad/oficio, dirección, teléfono y antigüedad."
    };
  }

  if (s === "RENTAS" && o === "REMESAS") {
    return {
      required: false,
      code: "REMESAS_SIN_CONSTANCIA",
      title: "No necesitas pedir constancia de ingresos",
      guidance: "Continúa con los datos de la actividad/remesas y antigüedad."
    };
  }

  if (s === "RENTAS" && o === "JUBILADO") {
    return {
      required: true,
      code: "JUBILADO_REQUIERE_SUSTENTO",
      title: "Debes pedir sustento de jubilación",
      guidance: "Pide constancia, comprobante o documento que confirme la jubilación/pensión y el ingreso."
    };
  }

  if (s === "VENTAS" && o === "INDEPENDIENTE FORMAL") {
    return {
      required: true,
      code: "INDEPENDIENTE_FORMAL_REQUIERE_CONSTANCIA",
      title: "Constancia de ingresos obligatoria",
      guidance: "Pide una constancia de ingresos o documento equivalente del cliente independiente formal."
    };
  }

  if (s === "VENTAS" && o === "INDEPENDIENTE INFORMAL") {
    return {
      required: false,
      code: "INDEPENDIENTE_INFORMAL_SIN_SUSTENTO",
      title: "No presenta sustento de ingresos",
      guidance: "No pidas constancia. Completa giro/oficio, dirección, teléfono y antigüedad."
    };
  }

  return {
    required: false,
    code: "SIN_REGLA",
    title: "Sin regla definida",
    guidance: "Revisa la clasificación de ingresos del Paso 1."
  };
}

async function extractStage1({
  dpiFront,
  dpiBack,
  env
}) {
  const prompt = `
TAREA: EXTRAER DATOS DE IDENTIDAD PARA UNA PRECALIFICACIÓN.

ARCHIVOS:
1. DPI ANVERSO.
2. DPI REVERSO.

EXTRAE ÚNICAMENTE CUANDO APAREZCA DE FORMA EXPLÍCITA:
- Nombre completo.
- Número de DPI.
- Fecha de nacimiento.
- NIT, solo si está impreso.
- Estado civil. Solo devuelve SOLTERO, CASADO o VIUDO cuando aparezca explícitamente. Si aparece otro estado o no es claro, omite el campo.
- Nombre del cónyuge (si aplica), solo si está impreso.
- Género, solo si está escrito explícitamente.

REGLAS:
- No inventes información.
- No infieras género, estado civil, edad ni ninguna característica a partir de la fotografía.
- Fecha inequívoca: YYYY-MM-DD.
- Número DPI: conserva todos los dígitos y ceros.
- NIT: no lo derives del DPI. Solo devolverlo si existe impreso explícitamente.
- Evalúa legibilidad de ambos lados, vigencia cuando pueda determinarse y estado visual.
- Si un dato no aparece, no lo incluyas.
- Si existe conflicto entre lados, usa status="conflict".
- confidence mide confianza de lectura, no calidad crediticia.
`.trim();

  const content = [];
  content.push({
    type: "input_text",
    text: prompt
  });

  await appendFileToOpenAIContent(
    content,
    dpiFront,
    "ARCHIVO 1: DPI ANVERSO",
    env
  );

  await appendFileToOpenAIContent(
    content,
    dpiBack,
    "ARCHIVO 2: DPI REVERSO",
    env
  );

  return callStructuredOpenAI({
    env: env,
    content: content,
    schema: STAGE1_SCHEMA,
    schemaName: "credit_stage1_prequalification",
    maxOutputTokens: 1800,
    timeoutMs: 90000
  });
}

async function addFileContent(content, file, label, env) {
  await appendFileToOpenAIContent(
    content,
    file,
    label,
    env
  );
}

async function extractStage2({ selfieFile, utilityFiles, incomeFiles, stage1Data, env }) {
  const source = stage1Data?.informacion_complementaria?.fuente_ingresos || "";
  const origin = stage1Data?.informacion_complementaria?.origen_ingresos || "";
  const subtype = stage1Data?.informacion_complementaria?.subtipo_ingreso || "";
  const policy = getIncomeSupportPolicy(source, origin, subtype);

  const prompt = `
TAREA: COMPLETAR LA ETAPA 2 DE UNA SOLICITUD YA PRECALIFICADA.

DATOS DEL PASO 1 (YA CAPTURADOS; NO LOS REPITAS COMO CAMPOS NUEVOS):
${JSON.stringify(stage1Data || {}, null, 2)}

CLASIFICACIÓN DE INGRESOS:
- Fuente: ${source}
- Origen: ${origin}
- Subtipo: ${subtype}
- Regla documental: ${policy.code}

ARCHIVOS:
1. Selfie del cliente sosteniendo el DPI a la altura del rostro.
2 en adelante. Recibo de luz, agua o constancia municipal.
Después, si fueron solicitados, documentos de sustento de ingresos.

OBJETIVOS:
1. SELFIE: no hagas reconocimiento facial ni comparación biométrica. Solo verifica:
   - que exista una persona visible;
   - que sostenga un DPI junto al rostro;
   - que el texto/número visible del DPI permita comparar con el DPI del Paso 1.
2. DOMICILIO: extrae únicamente la dirección completa.
   - Compara departamento/municipio del documento contra los ya capturados en Paso 1, pero NO los vuelvas a generar como campos.
3. INGRESOS/DIGITACIÓN: extrae únicamente los datos necesarios según la clasificación:
   - empresa/institución cuando corresponda;
   - giro/actividad/oficio cuando corresponda;
   - dirección de empresa/negocio/actividad;
   - teléfono;
   - antigüedad.
4. No repitas nombre, DPI, nacimiento, NIT personal, celular, estado civil, género, producto, monto solicitado,
   clasificación de ingresos, tipo de vivienda, departamento, municipio ni educación: ya vienen del Paso 1.
5. No inventes información. Si no aparece, omite el campo.
6. Si un documento contradice el Paso 1, reporta conflicto/advertencia, no lo reemplaces silenciosamente.
7. file_index inicia en 1: primero selfie, luego domicilio, luego ingresos.
`.trim();

  const content = [{ type: "input_text", text: prompt }];
  let idx = 1;

  await addFileContent(content, selfieFile, "ARCHIVO " + idx + " - SELFIE CON DPI", env);
  idx++;

  for (let i = 0; i < utilityFiles.length; i++) {
    await addFileContent(
      content,
      utilityFiles[i],
      "ARCHIVO " + idx + " - DOMICILIO - " + utilityFiles[i].name,
      env
    );
    idx++;
  }

  for (let i = 0; i < incomeFiles.length; i++) {
    await addFileContent(
      content,
      incomeFiles[i],
      "ARCHIVO " + idx + " - SUSTENTO DE INGRESOS - " + incomeFiles[i].name,
      env
    );
    idx++;
  }

  return callStructuredOpenAI({
    env: env,
    content: content,
    schema: STAGE2_SCHEMA,
    schemaName: "credit_stage2_completion",
    maxOutputTokens: 3200,
    timeoutMs: 90000
  });
}


// -----------------------------
// CATÁLOGO ZASHOME / PERSISTENCIA
// -----------------------------
function normalizeCatalogItem(x) {
  return {
    producto_id: x?.producto_id || null,
    sku: x?.sku || "",
    nombre: x?.nombre || x?.descripcion || "",
    descripcion: x?.descripcion || x?.nombre || "",
    categoria: x?.categoria || "",
    tipo_producto: x?.tipo_producto || "",
    precio: Number(x?.precio || 0),
    imagen_principal_url: x?.imagen_principal_url || x?.imagen_producto_url || "",
    activo: x?.activo !== false
  };
}

async function fetchCatalogFromZasHome(env, params = {}) {
  const url = new URL(ZASHOME_CATALOG_URL);
  for (const key of ["q", "category", "type"]) {
    if (params[key]) url.searchParams.set(key, String(params[key]));
  }

  const headers = { Accept: "application/json" };
  if (env.ZASHOME_API_KEY) headers.Authorization = `Bearer ${env.ZASHOME_API_KEY}`;

  const r = await fetch(url.toString(), { method: "GET", headers });
  const raw = await r.text();
  if (!r.ok) throw new Error(`ZasHome catálogo HTTP ${r.status}: ${raw.slice(0, 500)}`);

  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("ZasHome devolvió catálogo no válido."); }
  const source = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const seen = new Set();
  const out = [];
  for (const row of source) {
    const item = normalizeCatalogItem(row);
    if (!item.activo || !item.precio || !item.nombre) continue;
    const key = item.producto_id || `${item.sku}|${item.nombre}|${item.precio}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  out.sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
  return out;
}

async function findCatalogProduct(env, productId, sku) {
  const query = sku || productId || "";
  const list = await fetchCatalogFromZasHome(env, { q: query });
  let item = list.find(x => productId && x.producto_id === productId);
  if (!item) item = list.find(x => sku && x.sku === sku);
  return item || null;
}

function requestedAmountFromCatalogPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1.5 * 100) / 100;
}

async function kvGetJson(env, key) {
  if (!env.CREDIZAS_KV) return null;
  const raw = await env.CREDIZAS_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function kvPutJson(env, key, value, options = {}) {
  if (!env.CREDIZAS_KV) return false;
  await env.CREDIZAS_KV.put(key, JSON.stringify(value), options);
  return true;
}


function coverageNorm(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function coverageLooseTown(value) {
  let s = coverageNorm(value);
  s = s.replace(/^(ALDEA|CASERIO|CASERÍO|COLONIA|CANTON|CANTÓN|BARRIO|FINCA|SECTOR|COMUNIDAD|LOTIFICACION|LOTIFICACIÓN|PARCELAMIENTO)\s+/, "");
  return s.trim();
}

async function getCoverageData(env) {
  let data = await kvGetJson(env, COVERAGE_KV_KEY);
  if (data) return data;
  data = COVERAGE_SEED;
  // Semilla no destructiva: solo se crea si aún no existe.
  if (env.CREDIZAS_KV) {
    try { await kvPutJson(env, COVERAGE_KV_KEY, data); } catch {}
  }
  return data;
}

function coverageRowsFor(data, department, municipality) {
  const d = coverageNorm(department), m = coverageNorm(municipality);
  const areas = (data?.areas || []).filter(r => coverageNorm(r.department) === d && coverageNorm(r.municipality) === m);
  const bda = (data?.bda || []).filter(r => coverageNorm(r.department) === d && coverageNorm(r.municipality) === m);
  return { areas, bda };
}

function classifyCoverageTexts(texts) {
  const clean = [...new Set((texts || []).map(x => String(x || "").trim()).filter(Boolean))];
  if (!clean.length) return { level:"unknown", label:"Cobertura no determinada", blocked:false };
  const u = clean.map(x => coverageNorm(x));
  const partial = u.some(x => x.includes("BLOQUEO PARCIAL"));
  const blocked = u.some(x => x.includes("BLOQUEADO") || x.includes("BOQUEADO"));
  const enabled = u.some(x => x.includes("HABILIT") || x.includes("HABITAD") || x.includes("HORARIO"));
  const restricted = partial || u.some(x =>
    x.includes("HORARIO") || x.includes("SOLO") || x.includes("PARCIAL") ||
    x.includes("HASTA") || x.includes("CALLE PRINCIPAL") || x.includes("CASCO URBANO") ||
    x.includes("CLIENTES") || x.includes("CENTRO")
  );
  if (partial || (blocked && enabled)) return { level:"restricted", label:"Cobertura con condición", blocked:false };
  if (blocked) return { level:"blocked", label:"Sin cobertura de crédito por ubicación", blocked:true };
  if (restricted) return { level:"restricted", label:"Cobertura con condición", blocked:false };
  if (enabled) return { level:"enabled", label:"Cobertura BDA disponible", blocked:false };
  return { level:"unknown", label:"Cobertura no determinada", blocked:false };
}

function evaluateCoverage(data, department, municipality, town) {
  const departmentText = String(department || "").trim();
  const municipalityText = String(municipality || "").trim();
  const townText = String(town || "").trim();
  if (!departmentText || !municipalityText) {
    return {
      source_version:COVERAGE_SOURCE_VERSION,
      level:"unknown", blocked:false, label:"Selecciona departamento y municipio",
      detail:"La cobertura se evaluará cuando completes la ubicación."
    };
  }
  const {areas,bda} = coverageRowsFor(data, departmentText, municipalityText);
  const municipalityInArea = areas.length > 0;

  if (!townText) {
    if (municipalityInArea) {
      return {
        source_version:COVERAGE_SOURCE_VERSION,
        level:"enabled", blocked:false, label:"Municipio dentro del área de atención",
        detail:"Puedes continuar. Si conoces el nombre del poblado, agrégalo para validar restricciones específicas de BDA.",
        municipality_covered:true, matched_town:null, rules:[]
      };
    }
    if (bda.length) {
      return {
        source_version:COVERAGE_SOURCE_VERSION,
        level:"restricted", blocked:false, label:"Municipio con reglas BDA registradas",
        detail:"Agrega el nombre del poblado para validar la cobertura exacta.",
        municipality_covered:false, matched_town:null, rules:[]
      };
    }
    return {
      source_version:COVERAGE_SOURCE_VERSION,
      level:"blocked", blocked:true, label:"Sin cobertura de crédito registrada para este municipio",
      detail:"El municipio no aparece dentro de las áreas de atención del documento. Puedes continuar con la solicitud, pero la ubicación requiere validación.",
      municipality_covered:false, matched_town:null, rules:[]
    };
  }

  const townKey = coverageNorm(townText);
  const loose = coverageLooseTown(townText);
  let matches = bda.filter(r => coverageNorm(r.town) === townKey);
  let matchType = "exact";
  if (!matches.length && loose) {
    matches = bda.filter(r => coverageLooseTown(r.town) === loose);
    matchType = "normalized";
  }
  if (!matches.length && townKey.length >= 5) {
    const candidates = bda.filter(r => {
      const rk = coverageNorm(r.town);
      return rk.includes(townKey) || townKey.includes(rk);
    });
    const towns = [...new Set(candidates.map(r => coverageNorm(r.town)))];
    if (towns.length === 1) {
      matches = candidates;
      matchType = "approximate";
    }
  }

  if (!matches.length) {
    const areaTown = areas.find(r => r.town && (coverageNorm(r.town) === townKey || coverageLooseTown(r.town) === loose));
    if (areaTown) {
      return {
        source_version:COVERAGE_SOURCE_VERSION,
        level:"enabled", blocked:false, label:"Poblado dentro del área de atención",
        detail:"No se encontró una restricción específica en la columna BDA para este poblado.",
        municipality_covered:municipalityInArea, matched_town:areaTown.town, match_type:"area", rules:[]
      };
    }
    return municipalityInArea ? {
      source_version:COVERAGE_SOURCE_VERSION,
      level:"restricted", blocked:false, label:"Poblado no encontrado en la lista BDA",
      detail:"El municipio sí aparece como área de atención, pero este poblado no tiene una regla BDA identificada. Puedes continuar y validar manualmente.",
      municipality_covered:true, matched_town:null, match_type:"none", rules:[]
    } : {
      source_version:COVERAGE_SOURCE_VERSION,
      level:"blocked", blocked:true, label:"Sin cobertura de crédito registrada para esta ubicación",
      detail:"No se encontró el municipio ni el poblado dentro de la cobertura disponible en el documento. Puedes continuar, pero debe revisarse la ubicación.",
      municipality_covered:false, matched_town:null, match_type:"none", rules:[]
    };
  }

  const rules = [...new Set(matches.map(r => String(r.bda || "").trim()).filter(Boolean))];
  const c = classifyCoverageTexts(rules);
  return {
    source_version:COVERAGE_SOURCE_VERSION,
    level:c.level, blocked:c.blocked, label:c.label,
    detail:rules.join(" · "),
    municipality_covered:municipalityInArea,
    matched_town:matches[0]?.town || townText,
    match_type:matchType,
    rules
  };
}

function coverageMunicipalities(data, department) {
  const d = coverageNorm(department);
  const values = [];
  for (const r of [...(data?.areas || []), ...(data?.bda || [])]) {
    if (coverageNorm(r.department) === d && r.municipality) values.push(String(r.municipality).trim());
  }
  const map = new Map();
  for (const v of values) {
    const k = coverageNorm(v);
    const old = map.get(k);
    if (!old || v.length > old.length) map.set(k, v);
  }
  return [...map.values()].sort((a,b)=>a.localeCompare(b,"es"));
}

function coverageTowns(data, department, municipality) {
  const {areas,bda} = coverageRowsFor(data, department, municipality);
  const values = [...bda.map(r=>r.town), ...areas.map(r=>r.town).filter(Boolean)];
  const map = new Map();
  for (const v of values) {
    const k = coverageNorm(v);
    const old = map.get(k);
    if (!old || v.length > old.length) map.set(k, v);
  }
  return [...map.values()].sort((a,b)=>a.localeCompare(b,"es"));
}

async function getVendors(env) {
  const fromKv = await kvGetJson(env, VENDORS_KEY);
  if (Array.isArray(fromKv)) return fromKv;
  if (env.VENDEDORES_JSON) {
    try {
      const list = JSON.parse(env.VENDEDORES_JSON);
      if (Array.isArray(list)) return list;
    } catch {}
  }
  return [];
}


function stage1State(record) {
  return record?.stage1?.control?.estado || (record?.stage1 ? (record?.proceso === "PRECALIFICACION" ? (record?.estado || "SUBIDA") : "APROBADA") : "");
}

function formalizationControl(record) {
  if (record?.stage2?.control) return record.stage2.control;
  if (record?.formalizacion_control) return record.formalizacion_control;
  return null;
}

function formalizationState(record) {
  const ctl = formalizationControl(record);
  if (ctl?.estado) return ctl.estado;
  if (stage1State(record) === "APROBADA") {
    if (record?.stage2) return record?.estado || "SUBIDA";
    return "REQUIERE DATOS";
  }
  return "";
}

function derivedCaseProcess(record) {
  return stage1State(record) === "APROBADA" ? "FORMALIZACION DE CREDITO" : "PRECALIFICACION";
}

function activeCaseState(record) {
  return derivedCaseProcess(record) === "FORMALIZACION DE CREDITO"
    ? (formalizationState(record) || "REQUIERE DATOS")
    : (stage1State(record) || "SUBIDA");
}

function syncLegacyCaseControl(record) {
  record.proceso = derivedCaseProcess(record);
  record.estado = activeCaseState(record);
  if (record.proceso === "FORMALIZACION DE CREDITO" && !record.formalizacion_control) {
    record.formalizacion_control = { proceso:"FORMALIZACION DE CREDITO", estado:record.estado, detalle:null };
  }
  return record;
}

function stageDetail(record, stage) {
  if (stage === "FORMALIZACION DE CREDITO") {
    return record?.stage2?.control?.detalle || record?.formalizacion_control?.detalle || "";
  }
  return record?.stage1?.control?.detalle || "";
}

function caseSummary(record) {
  syncLegacyCaseControl(record);
  const s1 = record?.stage1?.data || {};
  const b = s1?.datos_basicos || {};
  const sol = s1?.solicitud || {};
  const comp = s1?.informacion_complementaria || {};
  const p1 = stage1State(record) || "SUBIDA";
  const p2 = formalizationState(record) || "";
  const process = derivedCaseProcess(record);
  const currentControl = process === "FORMALIZACION DE CREDITO"
    ? (formalizationControl(record) || {})
    : (record?.stage1?.control || {});
  return {
    id: record?.id,
    vendedor_id: record?.vendedor_id || "",
    vendedor: record?.vendedor || "",
    nombre: b?.nombre_completo || "",
    dpi: b?.numero_dpi || "",
    nit: b?.nit || "",
    telefono: b?.numero_celular || "",
    producto: sol?.producto_solicitado || "",
    producto_sku: sol?.producto_sku || "",
    precio_catalogo: Number(sol?.producto_precio_catalogo || 0),
    monto: Number(sol?.monto_total_solicitado || 0),
    ingreso: Number(comp?.ingreso_promedio_mensual || 0),
    proceso: process,
    estado: activeCaseState(record),
    estado_precalificacion: p1,
    estado_formalizacion: p2,
    detalle_precalificacion: stageDetail(record, "PRECALIFICACION"),
    detalle_formalizacion: stageDetail(record, "FORMALIZACION DE CREDITO"),
    detalle: currentControl?.detalle || record?.ultimo_requerimiento || "",
    procede: record?.procede_cliente || "",
    cerrado: activeCaseState(record) === "RECHAZADA",
    updated_at: record?.updated_at || record?.created_at || null,
    created_at: record?.created_at || null,
    stage1_submitted_at: record?.stage1?.submitted_at || null,
    stage2_submitted_at: record?.stage2?.submitted_at || null,
    tiene_paso1: Boolean(record?.stage1),
    tiene_paso2: Boolean(record?.stage2),
    pdf_stage1: Boolean(record?.pdfs?.stage1),
    pdf_final: Boolean(record?.pdfs?.final)
  };
}

async function loadCaseRecord(env, id) {
  return kvGetJson(env, CASE_PREFIX + id);
}

async function saveCaseRecord(env, record) {
  if (!env.CREDIZAS_KV) return false;
  record.updated_at = new Date().toISOString();
  if (!record.created_at) record.created_at = record.updated_at;
  await kvPutJson(env, CASE_PREFIX + record.id, record);
  return true;
}

async function listCaseRecords(env, { q = "", seller = "", status = "", process = "", sort = "updated_desc" } = {}) {
  if (!env.CREDIZAS_KV) return [];
  const listed = await env.CREDIZAS_KV.list({ prefix: CASE_PREFIX, limit: 200 });
  const records = [];
  for (const key of listed.keys || []) {
    const rec = await kvGetJson(env, key.name);
    if (rec) records.push(rec);
  }
  const needle = String(q || "").trim().toLowerCase();
  let out = records.filter(rec => {
    const s = caseSummary(rec);
    if (seller && String(s.vendedor) !== String(seller)) return false;
    if (status && String(s.estado) !== String(status)) return false;
    if (process && String(s.proceso) !== String(process)) return false;
    if (needle) {
      const hay = [s.nombre, s.dpi, s.nit, s.telefono].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  out.sort((a,b) => {
    const A = caseSummary(a), B = caseSummary(b);
    if (sort === "name_asc") return A.nombre.localeCompare(B.nombre, "es");
    if (sort === "nit_asc") return A.nit.localeCompare(B.nit, "es");
    if (sort === "date_asc") return String(A.updated_at||"").localeCompare(String(B.updated_at||""));
    return String(B.updated_at||"").localeCompare(String(A.updated_at||""));
  });
  return out;
}


function safeR2FileName(name) {
  return String(name || "archivo")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "archivo";
}


function stage1DocumentEntries(record) {
  const groups = record?.stage1_documents || {};
  return ["front","back"].flatMap(k => Array.isArray(groups[k]) ? groups[k] : []);
}

async function persistStage1Documents(env, record, caseId, groups) {
  if (!env.CREDIZAS_FILES) throw new Error("R2 no está configurado para conservar las fotos del DPI.");
  const current = record.stage1_documents || { front:[], back:[] };
  const changed = [];
  let oldBytes = 0, newBytes = 0, classA = 0;
  for (const category of ["front","back"]) {
    const files = Array.isArray(groups[category]) ? groups[category] : [];
    const old = Array.isArray(current[category]) ? current[category] : [];
    if (sameStoredGroup(old, files)) continue;
    changed.push({ category, files, old });
    oldBytes += old.reduce((a, x) => a + Number(x?.size || 0), 0);
    newBytes += files.reduce((a, x) => a + Number(x?.size || 0), 0);
    classA += old.length + files.length;
  }
  if (!changed.length) return current;
  const quota = await reserveR2Usage(env, { class_a:classA, storage_delta:newBytes-oldBytes });
  if (!quota.ok) throw new Error(quota.reason || "R2 bloqueado por protección de cuota.");
  const next = { front:[...(current.front||[])], back:[...(current.back||[])] };
  for (const item of changed) {
    for (const old of item.old) if (old?.key) await env.CREDIZAS_FILES.delete(old.key);
    const metas = [];
    for (let i=0;i<item.files.length;i++) {
      const file=item.files[i];
      const id=`stage1-${item.category}-${i}`;
      const key=`cases/${caseId}/documents/stage1/${item.category}/${i}-${safeR2FileName(file.name)}`;
      await env.CREDIZAS_FILES.put(key,file.stream(),{
        httpMetadata:{contentType:file.type||"application/octet-stream"},
        customMetadata:{case_id:String(caseId),category:`stage1-${item.category}`,original_name:String(file.name||"archivo")}
      });
      metas.push({id,category:`stage1-${item.category}`,key,name:file.name||"archivo",type:file.type||"application/octet-stream",size:Number(file.size||0),uploaded_at:new Date().toISOString()});
    }
    next[item.category]=metas;
  }
  record.stage1_documents=next;
  return next;
}

function findCaseDocument(record, docId) {
  return [...stage1DocumentEntries(record), ...stage2DocumentEntries(record)].find(x => String(x?.id || "") === String(docId || "")) || null;
}

function stage2DocumentEntries(record) {
  const groups = record?.stage2_documents || {};
  return ["selfie","utility","income"].flatMap(k => Array.isArray(groups[k]) ? groups[k] : []);
}

function sameStoredGroup(existing, files) {
  const old = Array.isArray(existing) ? existing : [];
  if (old.length !== files.length) return false;
  return old.every((m, i) => {
    const f = files[i];
    return String(m?.name || "") === String(f?.name || "") &&
      Number(m?.size || 0) === Number(f?.size || 0) &&
      String(m?.type || "") === String(f?.type || "");
  });
}

async function persistStage2Documents(env, record, caseId, groups) {
  if (!env.CREDIZAS_FILES) throw new Error("R2 no está configurado para conservar los documentos del Paso 2.");
  const current = record.stage2_documents || { selfie:[], utility:[], income:[] };
  const changed = [];
  let oldBytes = 0, newBytes = 0, classA = 0;
  for (const category of ["selfie","utility","income"]) {
    const files = Array.isArray(groups[category]) ? groups[category] : [];
    const old = Array.isArray(current[category]) ? current[category] : [];
    if (sameStoredGroup(old, files)) continue;
    changed.push({ category, files, old });
    oldBytes += old.reduce((a, x) => a + Number(x?.size || 0), 0);
    newBytes += files.reduce((a, x) => a + Number(x?.size || 0), 0);
    classA += old.length + files.length;
  }
  if (!changed.length) return current;

  const quota = await reserveR2Usage(env, { class_a:classA, storage_delta:newBytes-oldBytes });
  if (!quota.ok) throw new Error(quota.reason || "R2 bloqueado por protección de cuota.");

  const next = { selfie:[...(current.selfie||[])], utility:[...(current.utility||[])], income:[...(current.income||[])] };
  for (const item of changed) {
    for (const old of item.old) {
      if (old?.key) await env.CREDIZAS_FILES.delete(old.key);
    }
    const metas = [];
    for (let i = 0; i < item.files.length; i++) {
      const file = item.files[i];
      const id = item.category + "-" + i;
      const key = `cases/${caseId}/documents/${item.category}/${i}-${safeR2FileName(file.name)}`;
      await env.CREDIZAS_FILES.put(key, file.stream(), {
        httpMetadata:{ contentType:file.type || "application/octet-stream" },
        customMetadata:{ case_id:String(caseId), category:item.category, original_name:String(file.name || "archivo") }
      });
      metas.push({ id, category:item.category, key, name:file.name || "archivo", type:file.type || "application/octet-stream", size:Number(file.size || 0), uploaded_at:new Date().toISOString() });
    }
    next[item.category] = metas;
  }
  record.stage2_documents = next;
  return next;
}

function findStage2Document(record, docId) {
  return stage2DocumentEntries(record).find(x => String(x?.id || "") === String(docId || "")) || null;
}

function cookieMap(request) {
  const out = {};
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}

function bytesToBase64Url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return bytesToBase64Url(sig);
}

async function createAdminToken(env, user) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret) throw new Error("Configura ADMIN_SESSION_SECRET o ADMIN_PASSWORD.");
  const payload = btoa(JSON.stringify({ u:user, exp:Date.now()+8*60*60*1000 })).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  return payload + "." + await hmacHex(secret, payload);
}

async function verifyAdmin(request, env) {
  const token = cookieMap(request).credizas_admin;
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret) return false;
  if (await hmacHex(secret, payload) !== sig) return false;
  try {
    const padded = payload.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((payload.length+3)%4);
    const data = JSON.parse(atob(padded));
    return data.exp > Date.now() && data.u === (env.ADMIN_USER || "admin");
  } catch { return false; }
}


function normalizeSellerName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

async function listSellers(env) {
  if (!env.CREDIZAS_KV) return [];
  const listed = await env.CREDIZAS_KV.list({ prefix: SELLER_PREFIX, limit: 500 });
  const out = [];
  for (const key of listed.keys || []) {
    const row = await kvGetJson(env, key.name);
    if (row?.id && row?.name && row.active !== false) out.push({ id:row.id, name:row.name, created_at:row.created_at || null });
  }
  out.sort((a,b) => a.name.localeCompare(b.name, "es"));
  return out;
}

async function sellerPinHash(env, sellerId, pin) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "credizas-local-secret";
  return hmacHex(secret, `seller:${sellerId}:${pin}`);
}

async function createSellerToken(env, seller) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret) throw new Error("Configura ADMIN_SESSION_SECRET.");
  const payload = btoa(JSON.stringify({ sid:seller.id, n:seller.name, exp:Date.now()+12*60*60*1000 })).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  return payload + "." + await hmacHex(secret, payload);
}

async function verifySeller(request, env) {
  const token = cookieMap(request)[SELLER_COOKIE];
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret || await hmacHex(secret, payload) !== sig) return null;
  try {
    const padded = payload.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((payload.length+3)%4);
    const data = JSON.parse(atob(padded));
    if (!(data.exp > Date.now()) || !data.sid) return null;
    const seller = await kvGetJson(env, SELLER_PREFIX + data.sid);
    if (!seller || seller.active === false) return null;
    return { id:seller.id, name:seller.name };
  } catch { return null; }
}

function sellerOwnsCase(record, seller) {
  if (!record || !seller) return false;
  if (record.vendedor_id) return String(record.vendedor_id) === String(seller.id);
  return normalizeSellerName(record.vendedor).toLowerCase() === normalizeSellerName(seller.name).toLowerCase();
}

function sellerCasePermissions(record) {
  syncLegacyCaseControl(record);
  const process = derivedCaseProcess(record);
  const p1 = stage1State(record) || "SUBIDA";
  const p2 = formalizationState(record) || "";
  const has1 = Boolean(record?.stage1);
  const has2 = Boolean(record?.stage2);
  const current = process === "FORMALIZACION DE CREDITO" ? p2 : p1;
  const closed = current === "RECHAZADA";
  return {
    edit_stage1: !closed && process === "PRECALIFICACION" && has1 && p1 === "REQUIERE DATOS",
    start_stage2: !closed && process === "FORMALIZACION DE CREDITO" && has1 && !has2 && p2 === "REQUIERE DATOS",
    edit_stage2: !closed && process === "FORMALIZACION DE CREDITO" && has2 && p2 === "REQUIERE DATOS",
    view_stage1: has1,
    view_stage2: process === "FORMALIZACION DE CREDITO" && has1,
    closed,
    requirement: current === "REQUIERE DATOS"
      ? (process === "FORMALIZACION DE CREDITO"
          ? (stageDetail(record,"FORMALIZACION DE CREDITO") || record?.ultimo_requerimiento || "")
          : (stageDetail(record,"PRECALIFICACION") || record?.ultimo_requerimiento || ""))
      : ""
  };
}

function addCaseHistory(record, event, actor, detail = {}) {
  record.history = Array.isArray(record.history) ? record.history : [];
  record.history.push({ at:new Date().toISOString(), event, actor, ...detail });
  if (record.history.length > 80) record.history = record.history.slice(-80);
}

function currentControlForRecord(record) {
  syncLegacyCaseControl(record);
  if (derivedCaseProcess(record) === "FORMALIZACION DE CREDITO") {
    if (record?.stage2) return record.stage2.control || (record.stage2.control = record.formalizacion_control || { proceso:"FORMALIZACION DE CREDITO", estado:formalizationState(record) || "REQUIERE DATOS", detalle:null });
    return record.formalizacion_control || (record.formalizacion_control = { proceso:"FORMALIZACION DE CREDITO", estado:formalizationState(record) || "REQUIERE DATOS", detalle:null });
  }
  if (record?.stage1) return record.stage1.control || (record.stage1.control = { proceso:"PRECALIFICACION", estado:stage1State(record) || "SUBIDA", detalle:null });
  return null;
}

const ADMIN_EXPORT_FIELDS = {
  updated_at: "Fecha actualización",
  created_at: "Fecha creación",
  nombre: "Cliente",
  dpi: "DPI",
  nit: "NIT",
  telefono: "Teléfono",
  vendedor: "Vendedor",
  proceso: "Proceso",
  estado: "Estado actual",
  estado_precalificacion: "Estado Precalificación",
  estado_formalizacion: "Estado Formalización",
  detalle: "Detalle / información requerida",
  procede: "Qué procede con el cliente",
  producto: "Producto",
  producto_sku: "SKU",
  precio_catalogo: "Precio catálogo interno",
  monto: "Monto solicitado",
  ingreso: "Ingreso promedio mensual"
};

function xmlEscape(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;");
}

function makeExcelXml(records, fields) {
  const cols = fields.filter(f => ADMIN_EXPORT_FIELDS[f]);
  const cell = (value, type="String") => `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
  const rows = [];
  rows.push(`<Row>${cols.map(f => cell(ADMIN_EXPORT_FIELDS[f])).join("")}</Row>`);
  for (const rec of records) {
    const row = caseSummary(rec);
    rows.push(`<Row>${cols.map(f => {
      let v = row[f] ?? "";
      if (["monto","ingreso","precio_catalogo"].includes(f)) return cell(Number(v || 0), "Number");
      if (["updated_at","created_at"].includes(f) && v) { try { v = new Date(v).toLocaleString("es-GT"); } catch {} }
      return cell(v);
    }).join("")}</Row>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="CrediZas"><Table>${rows.join("")}</Table></Worksheet></Workbook>`;
}

// -----------------------------
// INTEGRACIONES / SIMULACIÓN
// -----------------------------
async function postJsonToExternal(url, token, payload) {
  const headers = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await r.text();
  let responseBody;
  try { responseBody = JSON.parse(text); } catch { responseBody = text; }

  if (!r.ok) throw new Error(`Endpoint externo HTTP ${r.status}: ${String(text).slice(0, 800)}`);
  return { status: r.status, response: responseBody };
}

function deriveStage2IncomeRule(source, origin) {
  const s = String(source || "").trim().toUpperCase();
  const o = String(origin || "").trim().toUpperCase();

  if (s === "SALARIO" && o === "SALARIO FORMAL") {
    return { required: true, code: "SALARIO_FORMAL_REQUIERE_SUSTENTO" };
  }
  if (s === "SALARIO" && o === "SALARIO INFORMAL") {
    return { required: false, code: "SALARIO_INFORMAL_SIN_CONSTANCIA" };
  }
  if (s === "RENTAS" && o === "REMESAS") {
    return { required: false, code: "REMESAS_SIN_CONSTANCIA" };
  }
  if (s === "RENTAS" && o === "JUBILADO") {
    return { required: true, code: "JUBILADO_REQUIERE_SUSTENTO" };
  }
  if (s === "VENTAS" && o === "INDEPENDIENTE FORMAL") {
    return { required: true, code: "INDEPENDIENTE_FORMAL_REQUIERE_CONSTANCIA" };
  }
  if (s === "VENTAS" && o === "INDEPENDIENTE INFORMAL") {
    return { required: false, code: "INDEPENDIENTE_INFORMAL_SIN_SUSTENTO" };
  }
  return { required: false, code: "SIN_REGLA" };
}

async function submitInitialValidation(payload, env) {
  if (!env.INITIAL_VALIDATION_URL) {
    return {
      forwarded: false,
      mode: "simulation",
      status: "pending",
      request_id: crypto.randomUUID(),
      message: "No hay endpoint de validación inicial configurado. Usa los botones de simulación.",
      sent_payload: payload
    };
  }

  const out = await postJsonToExternal(env.INITIAL_VALIDATION_URL, env.INITIAL_VALIDATION_TOKEN, payload);
  return {
    forwarded: true,
    mode: "real",
    status: "received",
    request_id: crypto.randomUUID(),
    external: out
  };
}

async function submitFinal(payload, env) {
  if (!env.FINAL_SYSTEM_URL) {
    return {
      forwarded: false,
      mode: "preview",
      message: "FINAL_SYSTEM_URL no está configurado. JSON consolidado listo para integración.",
      payload
    };
  }

  const out = await postJsonToExternal(env.FINAL_SYSTEM_URL, env.FINAL_SYSTEM_TOKEN, payload);
  return { forwarded: true, mode: "real", external: out };
}

// -----------------------------
// HTML / UI
// -----------------------------
function textField(name, label, type = "text", extra = "") {
  return `<div class="field" data-field="${name}"><label>${label}</label><input name="${name}" type="${type}" autocomplete="off" ${extra}><span class="field-meta"></span></div>`;
}

function selectField(name, label, options) {
  return `<div class="field" data-field="${name}"><label>${label}</label><select name="${name}">${options.map(x => `<option value="${x}">${x || "Seleccionar"}</option>`).join("")}</select><span class="field-meta"></span></div>`;
}

function yesNo(name, label) {
  return selectField(name, label, ["", "SI", "NO"]);
}

const APP_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Solicitud fácil de crédito</title>
<style>
:root{--bg:#f5f7fb;--card:#fff;--line:#dce3ee;--text:#172033;--muted:#667085;--blue:#14577a;--yellow:#ffc400;--ok:#16a36a;--warn:#e99a18;--bad:#e5483d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}header{background:#fff;border-bottom:1px solid var(--line);padding:18px}.header{max-width:1280px;margin:auto;display:flex;justify-content:space-between;gap:16px;align-items:center}.brand{font-size:13px;color:var(--blue);font-weight:900}.brand b{color:#d49f00}h1{font-size:21px;margin:3px 0}.subtitle{color:var(--muted);font-size:12px}main{max-width:1280px;margin:22px auto;padding:0 18px 60px}.screen.hidden,.hidden{display:none!important}.progress{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}.pstep{border:1px solid var(--line);background:#edf1f6;color:#718096;padding:12px;border-radius:12px;font-weight:800;font-size:13px}.pstep.active{background:#e8f5fb;color:var(--blue);border-color:#9bd2e4}.pstep.done{background:#eaf8f1;color:#11734b;border-color:#a9e3c7}.pstep.blocked{background:#fff0ef;color:#b42318;border-color:#f6bbb7}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:18px;box-shadow:0 5px 18px rgba(25,41,70,.04)}.card h2{font-size:18px;margin:0 0 8px}.card h3{font-size:14px;margin:22px 0 10px}.muted{color:var(--muted)}.notice{padding:12px 14px;border-radius:10px;background:#edf7fc;color:#175f7c;font-size:13px;margin:12px 0}.notice.success{background:#eaf8f1;color:#11734b}.notice.warning{background:#fff7e8;color:#945d00}.notice.bad{background:#fff0ef;color:#b42318}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:950px){.grid{grid-template-columns:repeat(2,1fr)}.grid3{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.grid,.grid3,.two,.progress{grid-template-columns:1fr}}.section-title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:9px;margin-bottom:13px}.badge{display:inline-flex;border-radius:999px;padding:4px 8px;background:#e8eef5;color:#526277;font-size:10px;font-weight:800}.badge.ok{background:#dcfce7;color:#166534}.badge.warn{background:#ffedd5;color:#9a3412}.badge.bad{background:#fee2e2;color:#991b1b}.upload-card{border:1px solid var(--line);border-radius:14px;padding:13px;background:#fbfcfe}.upload-title{font-size:12px;font-weight:900;margin-bottom:8px;color:#43506a}.file-input{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:8px;background:#fff}.file-input::file-selector-button{border:0;border-radius:8px;padding:9px 12px;margin-right:9px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer}.preview{height:230px;border:1px solid #d8e0ea;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-top:10px}.preview img{width:100%;height:100%;object-fit:contain}.preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:12px}.doc-preview-card{border:1px solid #d8e0ea;border-radius:12px;background:#fff;overflow:hidden}.doc-preview-head{padding:8px 10px;border-bottom:1px solid #e7ecf2;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.doc-preview-body{height:230px;background:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden}.doc-preview-body img{width:100%;height:100%;object-fit:contain}.doc-preview-body iframe{width:100%;height:100%;border:0}.doc-preview-foot{padding:7px 10px;border-top:1px solid #e7ecf2;font-size:10px;color:var(--muted)}.file-meta{font-size:11px;color:var(--muted);margin-top:7px}.field{display:flex;flex-direction:column;gap:5px}.field label{font-size:12px;font-weight:750;color:#43506a}.field input,.field select,.field textarea{width:100%;border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:10px 11px;font:inherit}.field textarea{min-height:78px;resize:vertical}.field input[readonly]{background:#f3f6f9;color:#475467;font-weight:700}.field-meta{font-size:10px;color:#718096;min-height:13px}.field.ai-found input,.field.ai-found select,.field.ai-found textarea{border-color:#79d8ac;background:#f2fbf6}.field.ai-uncertain input,.field.ai-uncertain select,.field.ai-uncertain textarea{border-color:#f1bd65;background:#fffaf0}.field.ai-conflict input,.field.ai-conflict select,.field.ai-conflict textarea{border-color:#ef8d86;background:#fff5f4}.field.invalid-state input,.field.invalid-state select,.field.invalid-state textarea{border-color:#ef4444!important;background:#fff1f2!important;box-shadow:0 0 0 1px rgba(239,68,68,.08)}.field.valid-state input,.field.valid-state select,.field.valid-state textarea{border-color:#22a06b!important;background:#effaf4!important}.validation-box{border:1px solid #ef4444;background:#fff1f2;color:#991b1b;border-radius:12px;padding:12px 14px;margin-top:16px;font-size:12px}.validation-box.ok{border-color:#22a06b;background:#effaf4;color:#166534}.fixed-rule{border:1px solid #86d3aa;background:#effaf4;color:#166534;border-radius:9px;padding:10px 11px;font-size:12px;font-weight:800;min-height:42px;display:flex;align-items:center}.word-preview{height:100%;width:100%;overflow:hidden;background:#fff;padding:10px;font-size:9px;line-height:1.25;color:#172033}.word-preview h1,.word-preview h2,.word-preview h3{font-size:11px;margin:5px 0}.word-preview p{margin:3px 0}.word-preview table{font-size:8px;border-collapse:collapse;width:100%}.word-preview td,.word-preview th{border:1px solid #dde4ec;padding:2px}.word-fallback{text-align:center;padding:20px;color:#14577a}.word-fallback strong{display:block;font-size:16px;margin-bottom:8px}.result-accordion{padding:0!important;overflow:hidden}.result-accordion summary{list-style:none;cursor:pointer;padding:18px 20px;display:flex;gap:10px;align-items:center;justify-content:space-between;font-weight:900}.result-accordion summary::-webkit-details-marker{display:none}.result-accordion .accordion-body{padding:0 20px 20px}.expand-hint{font-size:11px;color:#667085;font-weight:700}.result-accordion[open] .expand-hint::after{content:" · Ocultar"}.result-accordion:not([open]) .expand-hint::after{content:" · Expandir"}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}button{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:var(--blue);color:#fff}.yellow{background:var(--yellow);color:#2f2a00}.secondary{background:#e9eef5;color:#334155}.positive{background:var(--ok);color:#fff}.negative{background:var(--bad);color:#fff}.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:-2px}@keyframes spin{to{transform:rotate(360deg)}}pre{white-space:pre-wrap;word-break:break-word;background:#101827;color:#dbe7f3;border-radius:12px;padding:14px;font-size:11px;max-height:440px;overflow:auto}.tablebox{overflow:auto;border:1px solid var(--line);border-radius:10px}.rules{width:100%;border-collapse:collapse;font-size:12px}.rules th,.rules td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}.rules th{background:#f8fafc}.step-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.summary-chip{border:1px solid var(--line);border-radius:10px;padding:10px;background:#fafcff;font-size:12px}.reference-list{display:grid;gap:14px}.reference-card{border:1px solid #cfd9e6;border-radius:14px;background:#fbfcfe;padding:15px}.reference-card-title{font-size:14px;font-weight:900;color:var(--blue);padding-bottom:8px;margin-bottom:12px;border-bottom:1px solid #dfe6ef}.reference-card .grid{grid-template-columns:repeat(5,minmax(0,1fr))}.product-search-wrap{position:relative}.product-results{position:absolute;z-index:40;left:0;right:0;top:100%;max-height:340px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 28px rgba(15,23,42,.16);margin-top:4px}.product-option{display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;padding:9px;border-bottom:1px solid #edf1f5;cursor:pointer}.product-option:hover{background:#f2f8fb}.product-option img{width:54px;height:54px;object-fit:cover;border-radius:8px;background:#eef2f6}.product-option .po-name{font-size:11px;font-weight:800}.product-option .po-meta{font-size:10px;color:#667085}.product-option .po-price{font-weight:900;color:#14577a;font-size:12px}.selected-product{border:1px solid #86d3aa;background:#effaf4;border-radius:14px;padding:12px;margin-top:10px;font-size:11px}.selected-product-card{display:grid;grid-template-columns:92px 1fr;gap:14px;align-items:center}.selected-product-card img{width:92px;height:92px;object-fit:contain;border-radius:10px;background:#fff;border:1px solid #d8e5dc}.selected-product-card .sp-name{font-size:15px;font-weight:900;color:#153f55;margin-bottom:4px}.selected-product-card .sp-sku{font-size:11px;color:#667085}.selected-product-card .sp-amount{font-size:14px;font-weight:900;color:#11734b;margin-top:7px}.seller-login-grid{display:grid;grid-template-columns:1fr 180px auto;gap:10px;align-items:end}.seller-bar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.lock-note{border:1px solid #f0c36b;background:#fff8e8;color:#7b5100;border-radius:10px;padding:11px 13px;margin-bottom:12px}.case-row .case-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}@media(max-width:700px){.seller-login-grid{grid-template-columns:1fr}}.home-actions{display:grid;grid-template-columns:1fr 1fr;gap:16px}.home-panel{border:1px solid var(--line);border-radius:14px;padding:16px;background:#fff}.case-results{display:grid;gap:8px;margin-top:12px}.case-row{border:1px solid var(--line);border-radius:10px;padding:11px;background:#fafcff;display:flex;justify-content:space-between;gap:12px;align-items:center}.case-row strong{display:block}.case-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.seller-state{font-size:12px;font-weight:900;border-radius:999px;padding:7px 11px;background:#e8eef5;color:#475467;line-height:1.1}.seller-state.review{background:#e0f2fe;color:#075985}.seller-state.ok{background:#dcfce7;color:#166534}.seller-state.bad{background:#fee2e2;color:#991b1b}.seller-state.warn{background:#ffedd5;color:#9a3412}.seller-process{font-size:11px;font-weight:900;border-radius:999px;padding:6px 10px;background:#f1f5f9;color:#475569}.seller-stage-card{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.seller-stage-name{font-size:10px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.02em}.status-row{display:grid;grid-template-columns:180px 1fr;gap:12px;align-items:end}.state-detail.hidden{display:none!important}.top-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.draft-banner{border:1px solid #f4c56d;background:#fff8e8;color:#805400;padding:10px 12px;border-radius:10px;margin-top:10px}.catalog-price-note{font-size:10px;color:#667085;margin-top:4px}@media(max-width:700px){.home-actions,.status-row{grid-template-columns:1fr}}@media(max-width:1050px){.reference-card .grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.step-summary,.reference-card .grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
<div class="header">
  <div><div class="brand">Zas<b>Home</b> · Centro Inteligente de Información</div><h1 id="pageTitle">Solicitud fácil de crédito · Paso 1</h1><div class="subtitle" id="pageSubtitle">Sube el DPI, revisa los datos y completa lo que falta.</div></div>
  <div class="top-nav"><button type="button" class="secondary" id="homeBtn">Inicio</button><a href="/admin" target="_blank" style="text-decoration:none"><button type="button" class="secondary">Administrador</button></a><span class="badge">Fácil y guiado</span></div>
</div>
</header>
<main>

<section id="screenLogin" class="screen">
  <section class="card">
    <div class="section-title"><h2>Ingreso de vendedor</h2><span class="badge">Acceso</span></div>
    <div class="notice">Selecciona tu nombre e ingresa tu PIN de 4 números. Si eres vendedor nuevo, crea tu acceso una sola vez.</div>
    <div class="seller-login-grid">
      <div class="field"><label>Vendedor</label><select id="sellerLoginSelect"><option value="">Cargando vendedores...</option></select></div>
      <div class="field"><label>PIN de 4 números</label><input id="sellerLoginPin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="••••"></div>
      <button type="button" class="primary" id="sellerLoginBtn">Ingresar</button>
    </div>
    <div id="sellerLoginMsg"></div>
    <details style="margin-top:18px"><summary style="cursor:pointer;font-weight:900;color:#14577a">Soy vendedor nuevo · Crear acceso</summary>
      <div class="grid3" style="margin-top:12px">
        <div class="field"><label>Nombre completo *</label><input id="newSellerName" placeholder="Ej. MARÍA LÓPEZ"></div>
        <div class="field"><label>Crear PIN *</label><input id="newSellerPin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="4 números"></div>
        <div class="field"><label>Confirmar PIN *</label><input id="newSellerPin2" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="Repite el PIN"></div>
      </div>
      <button type="button" class="yellow" id="registerSellerBtn" style="margin-top:12px">Crear mi acceso</button><div id="registerSellerMsg"></div>
    </details>
  </section>
</section>

<section id="screenHome" class="screen hidden">
  <section class="card">
    <div class="seller-bar"><div><div class="section-title" style="border:0;margin:0;padding:0"><h2>Mis solicitudes</h2></div><div class="muted" id="sellerGreeting"></div></div><button type="button" class="secondary" id="sellerLogoutBtn">Cerrar sesión</button></div>
    <div id="draftBanner" class="draft-banner hidden"><strong>Hay un borrador guardado en este equipo.</strong><br><button type="button" id="resumeDraftBtn" class="yellow" style="margin-top:8px">Retomar borrador</button></div>
    <div class="home-actions" style="margin-top:14px">
      <div class="home-panel"><h3 style="margin-top:0">Nueva solicitud</h3><p class="muted">Crea una nueva precalificación para un cliente.</p><button type="button" class="primary" id="newCaseBtn">Nueva solicitud</button></div>
      <div class="home-panel"><h3 style="margin-top:0">Buscar mis solicitudes</h3><div class="field"><label>Nombre, DPI, NIT o teléfono</label><input id="caseSearchInput" placeholder="Buscar cliente"></div><button type="button" class="secondary" id="caseSearchBtn" style="margin-top:12px">Buscar</button></div>
    </div>
    <div id="caseSearchResults" class="case-results" style="margin-top:16px"></div>
  </section>
</section>

<section id="screen1" class="screen hidden">
  <div class="progress"><div class="pstep active" id="p1">1 · Subir DPI</div><div class="pstep" id="p2">2 · Revisar datos</div><div class="pstep" id="p3">3 · Enviar solicitud</div><div class="pstep" id="p4">4 · Resultado</div></div>

  <section class="card">
    <div class="section-title"><h2>1. Sube el DPI del cliente</h2><span class="badge">Solo esto para empezar</span></div>
    <div class="notice">Sube una foto clara del DPI por enfrente y por atrás. El sistema leerá automáticamente lo que pueda y luego te pedirá completar únicamente lo que falte.</div>
    <div class="two">
      <div class="upload-card"><div class="upload-title">Foto 1: DPI de enfrente *</div><input id="dpiFront" class="file-input" type="file" accept="image/*"><div class="preview" id="prevDpiFront"><span class="muted">Pendiente</span></div><div class="file-meta" id="metaDpiFront">Sin archivo</div></div>
      <div class="upload-card"><div class="upload-title">Foto 2: DPI de atrás *</div><input id="dpiBack" class="file-input" type="file" accept="image/*"><div class="preview" id="prevDpiBack"><span class="muted">Pendiente</span></div><div class="file-meta" id="metaDpiBack">Sin archivo</div></div>
    </div>
    <div id="uploadStatus" class="notice warning">Sube primero las dos fotos del DPI: enfrente y atrás.</div>
    <div class="actions"><button type="button" class="primary" id="analyzeBtn" disabled>Leer datos del DPI</button><button type="button" class="secondary" id="resetBtn">Reiniciar</button></div><div id="extractMsg"></div>
  </section>

  <section class="card hidden" id="formCard">
    <div class="section-title"><h2>2. Revisa y completa los datos del cliente</h2><span class="badge" id="qualityBadge">Revisar</span></div><div id="qualityBox"></div>
    <form id="preForm">
      <div class="grid">
        ${textField("datos_basicos.nombre_completo","Nombre completo *")}
        ${textField("datos_basicos.numero_dpi","Número de DPI *")}
        ${textField("datos_basicos.fecha_nacimiento","Fecha de nacimiento *","date")}
        ${textField("datos_basicos.nit","NIT *")}
        ${textField("datos_basicos.numero_celular","Celular del cliente *","tel")}
        ${selectField("datos_basicos.estado_civil","Estado civil *",["","SOLTERO","CASADO","VIUDO"])}
        ${textField("datos_basicos.nombre_conyuge","Nombre del cónyuge (si aplica)")}
        ${selectField("datos_basicos.genero","Género *",["","MASCULINO","FEMENINO"])}
        ${textField("datos_basicos.producto_interes","Producto de interés","text",'readonly value="CCO ELECTRO"')}
        <div class="field product-search-wrap" data-field="solicitud.producto_solicitado"><label>¿Qué producto quiere el cliente? *</label><input id="productSearch" type="text" autocomplete="off" placeholder="Busca por nombre o SKU"><input type="hidden" name="solicitud.producto_solicitado"><input type="hidden" name="solicitud.producto_id"><input type="hidden" name="solicitud.producto_sku"><input type="hidden" name="solicitud.producto_imagen_url"><div id="productResults" class="product-results hidden"></div><div id="selectedProduct" class="selected-product hidden"></div><span class="field-meta">Catálogo activo de ZasHome.</span></div>
        ${textField("solicitud.monto_total_solicitado","¿Cuánto desea solicitar el cliente?","number",'readonly step="0.01"')}
        ${textField("informacion_complementaria.ingreso_promedio_mensual","Ingreso promedio mensual del cliente *","number",'min="0" step="0.01"')}
        ${textField("datos_basicos.dpi_foto","DPI FOTO","text","readonly")}
      </div>

      <h3>¿Cómo obtiene sus ingresos?</h3>
      <div class="notice warning"><strong>Guía sencilla:</strong> elige primero la Fuente. El sistema te mostrará solo los Orígenes correctos y luego colocará el Subtipo correspondiente.</div>
      <div class="grid3">
        ${selectField("informacion_complementaria.fuente_ingresos","Fuente de ingresos *",["","SALARIO","RENTAS","VENTAS"])}
        ${selectField("informacion_complementaria.origen_ingresos","Origen de ingresos *",[""])}
        ${selectField("informacion_complementaria.subtipo_ingreso","Subtipo de ingreso *",[""])}
      </div>

      <h3>Información complementaria</h3>
      <div class="grid">
        ${textField("informacion_complementaria.tipo_nacionalidad","Tipo de nacionalidad","text",'readonly value="GUATEMALA"')}
        ${selectField("informacion_complementaria.tipo_vivienda","Tipo de vivienda *",["","PROPIA","VIVE CON FAMILIARES","ARRENDADA","PRESTADA"])}
        <div class="field" data-field="informacion_complementaria.departamento"><label>Departamento del domicilio *</label><input id="coverageDepartment" name="informacion_complementaria.departamento" list="coverageDepartments" autocomplete="off" placeholder="Selecciona o escribe el departamento"><datalist id="coverageDepartments"></datalist><span class="field-meta">Selecciona una opción de la lista cuando esté disponible.</span></div>
        <div class="field" data-field="informacion_complementaria.municipio"><label>Municipio del domicilio *</label><input id="coverageMunicipality" name="informacion_complementaria.municipio" list="coverageMunicipalities" autocomplete="off" placeholder="Selecciona o escribe el municipio"><datalist id="coverageMunicipalities"></datalist><span class="field-meta">Se filtra según el departamento.</span></div>
        <div class="field" data-field="informacion_complementaria.poblado"><label>Nombre de poblado (opcional)</label><input id="coverageTown" name="informacion_complementaria.poblado" list="coverageTowns" autocomplete="off" placeholder="Aldea, colonia, caserío, barrio, finca..."><datalist id="coverageTowns"></datalist><span class="field-meta">Si lo indicas, validaremos la regla exacta de la columna BDA.</span></div>
        ${selectField("informacion_complementaria.nivel_educacion","Nivel de educación *",["","PRIMARIA","BÁSICOS","DIVERSIFICADO","UNIVERSIDAD","OTRO"])}
      </div>
      <div id="coverageNotice" class="notice" style="margin-top:12px"><strong>Cobertura BDA:</strong> selecciona departamento y municipio.</div>
      <div id="stage1AdminNotice" class="hidden"></div>

      <div id="stage1ValidationBox" class="validation-box">Completa los campos obligatorios marcados en rojo.</div>
      <label style="display:flex;gap:9px;align-items:flex-start;margin-top:18px"><input id="verified" type="checkbox" style="margin-top:4px"><span>Confirmo que revisé los datos del cliente y completé lo que hacía falta.</span></label>
      <div class="actions"><button type="submit" class="yellow" id="submitBtn">Enviar solicitud del paso 1</button><button type="button" class="secondary hidden" id="cancelEditStage1">Cancelar edición</button><button type="button" class="secondary" id="showJsonBtn">Ver datos enviados</button><button type="button" class="primary" id="stage1PdfBtnForm" disabled>Descargar PDF del Paso 1</button></div><div class="muted" id="stage1PdfHint" style="margin-top:8px">El PDF se habilita después de enviar correctamente el Paso 1.</div><div id="submitMsg"></div><pre id="jsonPreview" class="hidden"></pre>
    </form>
  </section>

  <section class="card hidden" id="decisionCard"><div class="section-title"><h2>3. Solicitud enviada</h2><span class="badge ok" id="decisionBadge">Subida</span></div><div id="decisionBody"></div><div class="actions"><button type="button" class="secondary" id="stage1PdfBtn" disabled>Descargar expediente del Paso 1 (PDF)</button><button type="button" class="primary" id="backHomeAfterStage1">Volver a mis solicitudes</button></div></section>
</section>

<section id="screen2" class="screen hidden">
  <div class="progress"><div class="pstep done">1 · Precalificación</div><div class="pstep active">2 · Documentos</div><div class="pstep">3 · Completar datos</div><div class="pstep">4 · Envío final</div></div>

  <section class="card">
    <div class="section-title"><h2>Paso 2 · Documentos y datos restantes</h2><span class="badge ok">Paso 1 aprobado</span></div>
    <div class="notice success">No volveremos a pedir los datos del Paso 1. Aquí solo debes solicitar al cliente lo que falta para completar el expediente.</div><div id="stage2AccessNotice"></div>
    <div class="step-summary" id="stage2Summary"></div><div class="actions"><button type="button" class="secondary" id="stage1PdfBtn2">Descargar PDF del Paso 1</button><button type="button" class="primary" id="finalPdfBtnTop" disabled>Descargar expediente completo (PDF)</button></div><div class="muted" id="finalPdfHint" style="margin-top:8px">El expediente completo se habilita después de enviar correctamente el Paso 2.</div>
  </section>

  <section class="card">
    <div class="section-title"><h2>1. Primero sube los documentos</h2><span class="badge">Luego la IA completa datos</span></div><div class="notice">En este momento solo debes cargar los documentos indicados. Después pulsa <strong>Leer documentos y completar datos</strong>; entonces aparecerá el formulario con únicamente la información que falte.</div>
    <div class="grid3">
      <div class="upload-card"><div class="upload-title">SELFIE CON DPI *</div><div class="muted">Foto del cliente sosteniendo el DPI a la altura del rostro.</div><input id="stage2Selfie" class="file-input" type="file" accept="image/*"><div class="preview" id="prevStage2Selfie"><span class="muted">Pendiente</span></div><div class="file-meta" id="metaStage2Selfie">Sin archivo</div></div>
      <div class="upload-card"><div class="upload-title">DOCUMENTO DE DOMICILIO *</div><div class="muted">Recibo de luz, agua o constancia municipal.</div><input id="stage2Utility" class="file-input" type="file" accept="image/*,.pdf,.doc,.docx,.rtf,.odt,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple><div class="file-meta" id="metaStage2Utility">Sin archivo</div><div class="preview-grid" id="previewStage2Utility"></div></div>
      <div class="upload-card" id="stage2IncomeCard"><div class="upload-title" id="stage2IncomeTitle">SUSTENTO DE INGRESOS</div><div class="muted" id="stage2IncomeHelp"></div><input id="stage2Income" class="file-input" type="file" accept="image/*,.pdf,.doc,.docx,.rtf,.odt,.txt,application/pdf" multiple><div class="file-meta" id="metaStage2Income">Sin archivo</div><div class="preview-grid" id="previewStage2Income"></div></div>
    </div>
    <div id="stage2DocsStatus" class="notice warning">Completa los documentos indicados.</div>
    <div class="actions"><button type="button" class="primary" id="stage2AnalyzeBtn" disabled>Leer documentos y completar datos</button></div><div id="stage2ExtractMsg"></div>
  </section>

  <section class="card hidden" id="stage2FormCard">
    <div class="section-title"><h2>2. Completa únicamente lo que falta</h2><span class="badge" id="stage2QualityBadge">Revisar</span></div>
    <div id="stage2QualityBox"></div>
    <form id="stage2Form">
      <h3>Domicilio</h3>
      <div class="notice">El departamento y municipio ya vienen del Paso 1. Solo pedimos la dirección completa porque es el dato necesario para terminar esta sección.</div>
      <div class="grid">
        ${textField("domicilio.direccion_completa","Dirección completa *")}
      </div>

      <div id="companyGroup" class="hidden">
        <h3 id="companyGroupTitle">Datos de empresa / institución</h3>
        <div class="notice" id="companyGuide"></div>
        <div class="grid">
          ${textField("digitacion.nombre_empresa","Nombre de empresa / institución *")}
          ${textField("digitacion.direccion_empresa","Dirección completa *")}
          ${textField("digitacion.telefono_empresa","Teléfono *","tel")}
          ${textField("digitacion.antiguedad","Antigüedad *")}
        </div>
      </div>

      <div id="activityGroup" class="hidden">
        <h3>Datos de actividad / oficio / remesas</h3>
        <div class="notice">Pregunta al cliente qué actividad realiza. Si no tiene local, usa su domicilio. Si no tiene teléfono comercial, usa su celular. La antigüedad es el tiempo que lleva realizando la actividad, oficio o recibiendo remesas.</div>
        <div class="grid">
          ${textField("digitacion.giro_oficio","Giro, actividad u oficio *")}
          ${textField("digitacion.direccion_empresa","Dirección de la actividad *")}
          ${textField("digitacion.telefono_empresa","Teléfono de la actividad *","tel")}
          ${textField("digitacion.antiguedad","Tiempo realizando la actividad *")}
        </div>
      </div>

      <h3>3 referencias personales o familiares</h3>
      <div class="notice warning">Completa una ficha por persona. Debe ser familiar o amistad que no viva con el cliente, ser mayor de edad, ser localizable y poder confirmar el lugar de vivienda del cliente y sus datos laborales. El cónyuge no aplica como referencia.</div>
      <div class="reference-list">
        <div class="reference-card">
          <div class="reference-card-title">Referencia 1</div>
          <div class="grid">
            ${textField("referencias.0.nombre_completo","Nombre completo *")}
            ${textField("referencias.0.parentesco","Parentesco *")}
            ${textField("referencias.0.celular","Celular *","tel")}
            <input type="hidden" name="referencias.0.mayor_edad_confirmado" value="SI"><div class="field"><label>Mayor de edad</label><div class="fixed-rule">✓ SÍ · requisito fijo</div><div class="field-meta">Toda referencia debe ser mayor de edad.</div></div>
            <input type="hidden" name="referencias.0.mismo_domicilio" value="NO"><div class="field"><label>Vive con el cliente</label><div class="fixed-rule">✓ NO · requisito fijo</div><div class="field-meta">Debe ser familiar o amistad que no viva con el cliente.</div></div>
            <input type="hidden" name="referencias.0.certifica_datos" value="SI"><div class="field"><label>Puede confirmar información</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">Debe certificar lugar de vivienda del cliente y confirmar datos laborales.</div></div>
            <input type="hidden" name="referencias.0.localizable" value="SI"><div class="field"><label>Localizable</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">La referencia debe poder ser localizada.</div></div>
          </div>
        </div>
        <div class="reference-card">
          <div class="reference-card-title">Referencia 2</div>
          <div class="grid">
            ${textField("referencias.1.nombre_completo","Nombre completo *")}
            ${textField("referencias.1.parentesco","Parentesco *")}
            ${textField("referencias.1.celular","Celular *","tel")}
            <input type="hidden" name="referencias.1.mayor_edad_confirmado" value="SI"><div class="field"><label>Mayor de edad</label><div class="fixed-rule">✓ SÍ · requisito fijo</div><div class="field-meta">Toda referencia debe ser mayor de edad.</div></div>
            <input type="hidden" name="referencias.1.mismo_domicilio" value="NO"><div class="field"><label>Vive con el cliente</label><div class="fixed-rule">✓ NO · requisito fijo</div><div class="field-meta">Debe ser familiar o amistad que no viva con el cliente.</div></div>
            <input type="hidden" name="referencias.1.certifica_datos" value="SI"><div class="field"><label>Puede confirmar información</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">Debe certificar lugar de vivienda del cliente y confirmar datos laborales.</div></div>
            <input type="hidden" name="referencias.1.localizable" value="SI"><div class="field"><label>Localizable</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">La referencia debe poder ser localizada.</div></div>
          </div>
        </div>
        <div class="reference-card">
          <div class="reference-card-title">Referencia 3</div>
          <div class="grid">
            ${textField("referencias.2.nombre_completo","Nombre completo *")}
            ${textField("referencias.2.parentesco","Parentesco *")}
            ${textField("referencias.2.celular","Celular *","tel")}
            <input type="hidden" name="referencias.2.mayor_edad_confirmado" value="SI"><div class="field"><label>Mayor de edad</label><div class="fixed-rule">✓ SÍ · requisito fijo</div><div class="field-meta">Toda referencia debe ser mayor de edad.</div></div>
            <input type="hidden" name="referencias.2.mismo_domicilio" value="NO"><div class="field"><label>Vive con el cliente</label><div class="fixed-rule">✓ NO · requisito fijo</div><div class="field-meta">Debe ser familiar o amistad que no viva con el cliente.</div></div>
            <input type="hidden" name="referencias.2.certifica_datos" value="SI"><div class="field"><label>Puede confirmar información</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">Debe certificar lugar de vivienda del cliente y confirmar datos laborales.</div></div>
            <input type="hidden" name="referencias.2.localizable" value="SI"><div class="field"><label>Localizable</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">La referencia debe poder ser localizada.</div></div>
          </div>
        </div>
      </div>
      <div id="stage2AdminNotice" class="hidden"></div>

      <div id="stage2ValidationBox" class="validation-box">Completa los campos obligatorios marcados en rojo.</div>
      <label style="display:flex;gap:9px;align-items:flex-start;margin-top:18px"><input id="stage2Verified" type="checkbox" style="margin-top:4px"><span>Confirmo que revisé los documentos y completé los datos faltantes con el cliente.</span></label>
      <div class="actions"><button type="submit" class="yellow" id="finalSubmitBtn">Enviar expediente completo</button><button type="button" class="secondary hidden" id="cancelEditStage2">Cancelar edición</button><button type="button" class="secondary" id="stage2JsonBtn">Ver expediente</button><button type="button" class="primary" id="finalPdfBtn" disabled>Descargar expediente completo (PDF)</button></div><div id="finalMsg"></div><pre id="stage2JsonPreview" class="hidden"></pre>
    </form>
  </section>

  <details class="card result-accordion hidden" id="finalResultCard"><summary><span>Expediente terminado</span><span class="badge ok">Completo</span><span class="expand-hint">Resultado</span></summary><div class="accordion-body" id="finalResultBody"></div></details>
</section>

</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mammoth@1.10.0/mammoth.browser.min.js"></script>
<script>
const q=s=>document.querySelector(s);
let extracted=null,sentPayload=null,requestId=null,stage2Extraction=null,stage1Decision=null,finalPayloadCache=null,currentCaseId=null,currentSeller="",currentSellerId="",sellerSession=null,currentPermissions={},currentRecordState=null,stage2AnalyzedSignature="",coverageLastResult=null,coverageTimer=null;
const pageParams=new URLSearchParams(location.search);const adminMode=pageParams.get("admin")==="1";const adminCaseId=pageParams.get("case_id")||"";const adminSellerId=pageParams.get("seller_id")||"";
const preparedUploads={dpiFront:[],dpiBack:[],stage2Selfie:[],stage2Utility:[],stage2Income:[]};

const DRAFT_KEY="credizas_draft_v19";
const FILE_DB="credizas_files_v19";

function digits8(v){return String(v||"").replace(/\D/g,"").slice(0,8)}
function validPhone(v){return /^\d{8}$/.test(String(v||""))}
function setupPhoneInputs(){document.querySelectorAll('input[type="tel"]').forEach(el=>{el.inputMode="numeric";el.maxLength=8;el.pattern="[0-9]{8}";el.addEventListener("input",()=>{el.value=digits8(el.value);saveDraftSoon()})})}
function stage2Signature(){return [preparedUploads.stage2Selfie,...preparedUploads.stage2Utility,...preparedUploads.stage2Income].map(f=>[f.name,f.size,f.lastModified].join(":" )).join("|")}
function invalidateStage2Analysis(){stage2AnalyzedSignature="";q("#stage2ExtractMsg").innerHTML=""}
function selectedSeller(){return currentSeller||sellerSession?.name||""}
function showOnly(id){for(const x of ["screenLogin","screenHome","screen1","screen2"])q("#"+x)?.classList.toggle("hidden",x!==id)}
let sellerRefreshTimer=null;
function startSellerAutoRefresh(){if(sellerRefreshTimer)return;sellerRefreshTimer=setInterval(()=>{if(sellerSession&&!q("#screenHome")?.classList.contains("hidden"))loadSellerCases().catch(()=>{})},5000)}
function goHome(){if(adminMode){location.href="/admin";return}if(!sellerSession){showOnly("screenLogin");return}showOnly("screenHome");q("#pageTitle").textContent="CrediZas · Mis solicitudes";q("#pageSubtitle").textContent="Consulta el estado de tus clientes o crea una nueva solicitud.";q("#sellerGreeting").textContent="Vendedor: "+sellerSession.name;loadSellerCases();startSellerAutoRefresh()}
function sellerStateLabel(v){return v==="REQUIERE DATOS"?"REQUIERE INFORMACIÓN":v==="EN REVISION"?"EN REVISIÓN":v}
function sellerProcessLabel(v){return v==="FORMALIZACION DE CREDITO"?"Formalización de crédito":"Precalificación"}
function sellerStateClass(v){return v==="APROBADA"?"ok":v==="RECHAZADA"?"bad":v==="REQUIERE DATOS"||v==="REINGRESADO"?"warn":v==="EN REVISION"?"review":""}

function setDatalist(id, values){const dl=q("#"+id);if(!dl)return;dl.innerHTML=(values||[]).map(v=>'<option value="'+esc(v)+'"></option>').join("")}
function coverageNoticeClass(level){return level==="blocked"?"notice bad":level==="enabled"?"notice success":level==="restricted"?"notice warning":"notice"}
function renderCoverageNotice(result){coverageLastResult=result||null;const box=q("#coverageNotice");if(!box)return;if(!result){box.className="notice";box.innerHTML="<strong>Cobertura BDA:</strong> selecciona departamento y municipio.";return}box.className=coverageNoticeClass(result.level);const title=result.blocked?"⚠ SIN COBERTURA DE CRÉDITO POR UBICACIÓN":result.level==="restricted"?"⚠ "+(result.label||"Cobertura con condición"):"✓ "+(result.label||"Cobertura disponible");box.innerHTML="<strong>"+esc(title)+"</strong><br>"+esc(result.detail||"")+(result.matched_town?'<br><span class="muted">Poblado validado: '+esc(result.matched_town)+'</span>':"")}
async function loadCoverageDepartments(){try{const r=await fetch("/api/coverage/departments",{cache:"no-store"}),d=await r.json();if(r.ok&&d.ok)setDatalist("coverageDepartments",d.departments||[])}catch{}}
async function loadCoverageMunicipalities(){const dep=q("#coverageDepartment")?.value.trim()||"";setDatalist("coverageMunicipalities",[]);setDatalist("coverageTowns",[]);if(!dep)return;try{const u=new URL("/api/coverage/municipalities",location.origin);u.searchParams.set("department",dep);const r=await fetch(u,{cache:"no-store"}),d=await r.json();if(r.ok&&d.ok)setDatalist("coverageMunicipalities",d.municipalities||[])}catch{}}
async function loadCoverageTowns(){const dep=q("#coverageDepartment")?.value.trim()||"",mun=q("#coverageMunicipality")?.value.trim()||"";setDatalist("coverageTowns",[]);if(!dep||!mun)return;try{const u=new URL("/api/coverage/towns",location.origin);u.searchParams.set("department",dep);u.searchParams.set("municipality",mun);const r=await fetch(u,{cache:"no-store"}),d=await r.json();if(r.ok&&d.ok)setDatalist("coverageTowns",d.towns||[])}catch{}}
async function checkCoverageNow(){const dep=q("#coverageDepartment")?.value.trim()||"",mun=q("#coverageMunicipality")?.value.trim()||"",town=q("#coverageTown")?.value.trim()||"";if(!dep||!mun){renderCoverageNotice(null);return null}try{const u=new URL("/api/coverage/check",location.origin);u.searchParams.set("department",dep);u.searchParams.set("municipality",mun);if(town)u.searchParams.set("town",town);const r=await fetch(u,{cache:"no-store"}),d=await r.json();if(r.ok&&d.ok){renderCoverageNotice(d.coverage);return d.coverage}}catch{}renderCoverageNotice({level:"unknown",blocked:false,label:"Cobertura no disponible",detail:"No se pudo consultar la tabla de cobertura en este momento. Puedes continuar con la solicitud."});return null}
function scheduleCoverageCheck(){clearTimeout(coverageTimer);coverageTimer=setTimeout(()=>{checkCoverageNow().catch(()=>{})},350)}
function setupCoverageInputs(){loadCoverageDepartments();const dep=q("#coverageDepartment"),mun=q("#coverageMunicipality"),town=q("#coverageTown");dep?.addEventListener("change",async()=>{await loadCoverageMunicipalities();await loadCoverageTowns();scheduleCoverageCheck();saveDraftSoon()});dep?.addEventListener("input",()=>{scheduleCoverageCheck();saveDraftSoon()});mun?.addEventListener("change",async()=>{await loadCoverageTowns();scheduleCoverageCheck();saveDraftSoon()});mun?.addEventListener("input",()=>{scheduleCoverageCheck();saveDraftSoon()});town?.addEventListener("change",()=>{scheduleCoverageCheck();saveDraftSoon()});town?.addEventListener("input",()=>{scheduleCoverageCheck();saveDraftSoon()})}
async function refreshCoverageFromForm(){await loadCoverageDepartments();await loadCoverageMunicipalities();await loadCoverageTowns();return checkCoverageNow()}


function flattenObject(obj,prefix="",out={}){if(obj===null||obj===undefined)return out;for(const [k,v] of Object.entries(obj)){const path=prefix?prefix+"."+k:k;if(Array.isArray(v)){v.forEach((x,i)=>flattenObject(x,path+"."+i,out))}else if(v&&typeof v==="object")flattenObject(v,path,out);else out[path]=v}return out}
function visibleNamedField(form,name){const els=[...form.querySelectorAll('[name="'+CSS.escape(name)+'"]')];return els.find(el=>!el.closest(".hidden"))||els[0]||null}
function fillForm(form,data){const flat=flattenObject(data);for(const [name,value] of Object.entries(flat)){const el=visibleNamedField(form,name);if(el&&value!==null&&value!==undefined){el.value=String(value);el.dispatchEvent(new Event("change",{bubbles:true}))}}}

let draftTimer=null;
function saveDraftSoon(){clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,250)}
function saveDraft(){if(adminMode)return;try{const data={case_id:currentCaseId,seller:currentSeller||selectedSeller(),seller_id:currentSellerId||sellerSession?.id||"",screen:q("#screen2")&&!q("#screen2").classList.contains("hidden")?"screen2":"screen1",stage1:collect(q("#preForm")),stage2:collect(q("#stage2Form")),sentPayload,requestId,stage1Decision};localStorage.setItem(DRAFT_KEY,JSON.stringify(data));q("#draftBanner")?.classList.remove("hidden")}catch{}}
function clearDraft(clearFiles=true){localStorage.removeItem(DRAFT_KEY);q("#draftBanner")?.classList.add("hidden");if(clearFiles)clearCachedFiles().catch(()=>{})}

function openFileDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(FILE_DB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains("files"))db.createObjectStore("files")};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function localFileKey(key){return String(currentCaseId||"draft")+":"+key}
async function cacheFiles(key,files){try{const db=await openFileDb();await new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").put(files,localFileKey(key));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}}
async function readCachedFiles(key){try{const db=await openFileDb();const value=await new Promise((resolve,reject)=>{const tx=db.transaction("files","readonly");const r=tx.objectStore("files").get(localFileKey(key));r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});db.close();return value}catch{return []}}
async function clearCachedFiles(){try{const db=await openFileDb();await new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}}

async function restorePreparedFiles(){for(const key of Object.keys(preparedUploads)){const fs=await readCachedFiles(key);if(Array.isArray(fs)&&fs.length)preparedUploads[key]=fs}if(preparedUploads.dpiFront[0]){q("#prevDpiFront").innerHTML='<img src="'+objUrl(preparedUploads.dpiFront[0])+'">';q("#metaDpiFront").textContent=preparedUploads.dpiFront[0].name}if(preparedUploads.dpiBack[0]){q("#prevDpiBack").innerHTML='<img src="'+objUrl(preparedUploads.dpiBack[0])+'">';q("#metaDpiBack").textContent=preparedUploads.dpiBack[0].name}if(preparedUploads.stage2Selfie[0]){q("#prevStage2Selfie").innerHTML='<img src="'+objUrl(preparedUploads.stage2Selfie[0])+'">';q("#metaStage2Selfie").textContent=preparedUploads.stage2Selfie[0].name}await renderMulti(q("#previewStage2Utility"),preparedUploads.stage2Utility);await renderMulti(q("#previewStage2Income"),preparedUploads.stage2Income);updateButtons()}


function stage1StoredGroups(rec){return rec?.stage1_documents||{front:[],back:[]}}
async function storedCaseDocToFile(meta){const u="/api/cases/"+encodeURIComponent(currentCaseId)+"/documents/"+encodeURIComponent(meta.id);const r=await fetch(u,{cache:"no-store"});if(!r.ok){let msg="No se pudo recuperar "+(meta.name||"documento");try{const d=await r.json();msg=d.error||msg}catch{}throw new Error(msg)}const blob=await r.blob();return new File([blob],meta.name||"documento",{type:meta.type||blob.type||"application/octet-stream",lastModified:Date.parse(meta.uploaded_at||"")||Date.now()})}
async function restoreServerStage1Documents(rec){const groups=stage1StoredGroups(rec),errors=[];for(const [dest,src] of [["dpiFront","front"],["dpiBack","back"]]){const metas=Array.isArray(groups[src])?groups[src]:[];if(metas.length){try{const file=await storedCaseDocToFile(metas[0]);preparedUploads[dest]=[file];await cacheFiles(dest,[file])}catch(e){errors.push(e.message)}}else{const local=await readCachedFiles(dest);preparedUploads[dest]=Array.isArray(local)&&local.length?local:[]}}
if(preparedUploads.dpiFront[0]){q("#prevDpiFront").innerHTML='<img src="'+objUrl(preparedUploads.dpiFront[0])+'">';q("#metaDpiFront").textContent="Guardado: "+preparedUploads.dpiFront[0].name}else{q("#prevDpiFront").innerHTML='<span class="muted">DPI frente no almacenado</span>';q("#metaDpiFront").textContent="Sin archivo guardado · vuelve a subirlo si necesitas editar"}
if(preparedUploads.dpiBack[0]){q("#prevDpiBack").innerHTML='<img src="'+objUrl(preparedUploads.dpiBack[0])+'">';q("#metaDpiBack").textContent="Guardado: "+preparedUploads.dpiBack[0].name}else{q("#prevDpiBack").innerHTML='<span class="muted">DPI reverso no almacenado</span>';q("#metaDpiBack").textContent="Sin archivo guardado · vuelve a subirlo si necesitas editar"}
if(errors.length)q("#extractMsg").innerHTML='<div class="notice warning"><strong>Algunas fotos del DPI no pudieron recuperarse:</strong><br>'+errors.map(esc).join("<br>")+'</div>';updateButtons()}
function stage2StoredGroups(rec){return rec?.stage2_documents||{selfie:[],utility:[],income:[]}}
async function storedDocToFile(meta){return storedCaseDocToFile(meta)}
async function restoreServerStage2Documents(rec){const groups=stage2StoredGroups(rec),errors=[],policy=stage2Policy();for(const [dest,src] of [["stage2Selfie","selfie"],["stage2Utility","utility"],["stage2Income","income"]]){if(src==="income"&&!policy.required){preparedUploads[dest]=[];continue}const metas=Array.isArray(groups[src])?groups[src]:[];if(!metas.length){preparedUploads[dest]=[];continue}const files=[];for(const meta of metas){try{files.push(await storedDocToFile(meta))}catch(e){errors.push(e.message)}}preparedUploads[dest]=files;if(files.length)await cacheFiles(dest,files)}if(preparedUploads.stage2Selfie[0]){q("#prevStage2Selfie").innerHTML='<img src="'+objUrl(preparedUploads.stage2Selfie[0])+'">';q("#metaStage2Selfie").textContent=preparedUploads.stage2Selfie[0].name}else{q("#prevStage2Selfie").innerHTML='<span class="muted">Pendiente</span>';q("#metaStage2Selfie").textContent="Sin archivo"}await renderMulti(q("#previewStage2Utility"),preparedUploads.stage2Utility);await renderMulti(q("#previewStage2Income"),preparedUploads.stage2Income);q("#metaStage2Utility").textContent=preparedUploads.stage2Utility.length?preparedUploads.stage2Utility.map(f=>f.name).join(" · "):"Sin archivo";q("#metaStage2Income").textContent=preparedUploads.stage2Income.length?preparedUploads.stage2Income.map(f=>f.name).join(" · "):"Sin archivo";if((rec?.stage2_draft?.extraction||rec?.stage2?.extraction)&&stage2Signature())stage2AnalyzedSignature=stage2Signature();if(errors.length)q("#stage2ExtractMsg").innerHTML='<div class="notice warning"><strong>Algunos documentos no pudieron recuperarse:</strong><br>'+errors.map(esc).join("<br>")+'</div>';updateButtons()}
function applyStoredStage2Extraction(rec){const ex=rec?.stage2?.extraction||rec?.stage2_draft?.extraction||null;if(!ex)return;stage2Extraction=ex;if(!rec?.stage2?.data)applyExtraction(ex.fields||[],q("#stage2Form"));const sc=ex.selfie_check,dc=ex.domicile_consistency,ic=ex.income_consistency,problem=!sc?.persona_visible||!sc?.dpi_visible_junto_al_rostro||sc?.texto_dpi_comparable==="no_coincide"||dc?.status==="possible_conflict"||ic?.status==="possible_conflict";q("#stage2QualityBadge").className="badge "+(problem?"warn":"ok");q("#stage2QualityBadge").textContent=problem?"Revisar":"Documentos revisados";q("#stage2QualityBox").innerHTML='<div class="notice '+(problem?'warning':'success')+'"><strong>Revisión automática guardada</strong><br>Selfie con DPI: '+(sc?.dpi_visible_junto_al_rostro?'Correcta':'Revisar')+' · Domicilio: '+esc(dc?.status||'insufficient')+' · Ingresos: '+esc(ic?.status||'not_applicable')+'</div>'}

async function resumeDraft(){const raw=localStorage.getItem(DRAFT_KEY);if(!raw||!sellerSession)return;try{const d=JSON.parse(raw);if(d.seller_id&&d.seller_id!==sellerSession.id){alert("Este borrador pertenece a otro vendedor.");return}currentCaseId=d.case_id||crypto.randomUUID();currentSeller=sellerSession.name;currentSellerId=sellerSession.id;if(d.stage1){fillForm(q("#preForm"),d.stage1);syncProductUiFromForm();coverageLastResult=d.stage1?.informacion_complementaria?.cobertura_bda||null;refreshCoverageFromForm().catch(()=>{})}if(d.stage2)fillForm(q("#stage2Form"),d.stage2);sentPayload=d.sentPayload||null;requestId=d.requestId||null;stage1Decision=d.stage1Decision||null;await restorePreparedFiles();currentPermissions=d.screen==="screen2"?{edit_stage2:true}:{edit_stage1:true};if(d.screen==="screen2"&&sentPayload){showOnly("screen2");configureStage2();q("#stage2FormCard").classList.toggle("hidden",!stage2Extraction);setStageEditable("stage2",true,"")}else{showOnly("screen1");q("#formCard").classList.remove("hidden");setStageEditable("stage1",true,"")}q("#pageTitle").textContent=d.screen==="screen2"?"Solicitud fácil de crédito · Paso 2":"Solicitud fácil de crédito · Paso 1";updateStage1ValidationUI();updateStage2ValidationUI()}catch(e){alert("No se pudo recuperar el borrador: "+e.message)}}

function only4(el){el.value=String(el.value||"").replace(/\D/g,"").slice(0,4)}
async function loadSellerOptions(){try{const r=await fetch("/api/sellers/public"),d=await r.json(),sel=q("#sellerLoginSelect");sel.innerHTML='<option value="">Seleccionar vendedor</option>';for(const v of d.sellers||[]){const o=document.createElement("option");o.value=v.id;o.textContent=v.name;sel.appendChild(o)}}catch{q("#sellerLoginSelect").innerHTML='<option value="">No se pudo cargar</option>'}}
async function checkSellerSession(){try{const r=await fetch("/api/seller/me"),d=await r.json();if(r.ok&&d.ok&&d.seller){sellerSession=d.seller;currentSeller=d.seller.name;currentSellerId=d.seller.id;goHome();return true}}catch{}sellerSession=null;currentSeller="";currentSellerId="";showOnly("screenLogin");return false}
async function sellerLogin(){const seller_id=q("#sellerLoginSelect").value,pin=q("#sellerLoginPin").value;const msg=q("#sellerLoginMsg");if(!seller_id||!/^[0-9]{4}$/.test(pin)){msg.innerHTML='<div class="notice warning">Selecciona vendedor e ingresa un PIN de 4 números.</div>';return}const r=await fetch("/api/seller/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seller_id,pin})}),d=await r.json();if(!r.ok||!d.ok){msg.innerHTML='<div class="notice bad">'+esc(d.error||"No autorizado")+'</div>';return}sellerSession=d.seller;currentSeller=d.seller.name;currentSellerId=d.seller.id;q("#sellerLoginPin").value="";goHome()}
async function registerSeller(){const name=q("#newSellerName").value.trim(),pin=q("#newSellerPin").value,pin2=q("#newSellerPin2").value,msg=q("#registerSellerMsg");if(name.length<3){msg.innerHTML='<div class="notice warning">Escribe tu nombre completo.</div>';return}if(!/^[0-9]{4}$/.test(pin)||pin!==pin2){msg.innerHTML='<div class="notice warning">El PIN debe tener exactamente 4 números y coincidir.</div>';return}const r=await fetch("/api/seller/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,pin})}),d=await r.json();if(!r.ok||!d.ok){msg.innerHTML='<div class="notice bad">'+esc(d.error||"No se pudo crear el vendedor")+'</div>';return}sellerSession=d.seller;currentSeller=d.seller.name;currentSellerId=d.seller.id;await loadSellerOptions();goHome()}
async function sellerLogout(){await fetch("/api/seller/logout",{method:"POST"});sellerSession=null;currentSeller="";currentSellerId="";currentCaseId=null;showOnly("screenLogin");q("#pageTitle").textContent="CrediZas · Acceso de vendedor";q("#pageSubtitle").textContent="Ingresa con tu nombre y PIN.";await loadSellerOptions()}
function actionForCase(c){if(c.estado==="RECHAZADA")return{label:"Ver · Cerrada",edit:false};if(c.proceso==="FORMALIZACION DE CREDITO"&&!c.tiene_paso2)return{label:"Completar Paso 2",edit:true};if(c.estado==="REQUIERE DATOS")return{label:"Editar información",edit:true};return{label:"Ver",edit:false}}
async function loadSellerCases(){if(!sellerSession)return;const term=q("#caseSearchInput")?.value.trim()||"",u=new URL("/api/seller/cases",location.origin);if(term)u.searchParams.set("q",term);const r=await fetch(u,{cache:"no-store"}),d=await r.json(),box=q("#caseSearchResults");if(r.status===401){await sellerLogout();return}if(!r.ok){box.innerHTML='<div class="notice bad">'+esc(d.error||"No se pudo cargar")+'</div>';return}box.innerHTML=(d.cases||[]).length?(d.cases||[]).map(c=>{const a=actionForCase(c),detail=c.estado==="REQUIERE DATOS"&&c.detalle?'<div class="notice warning" style="margin:7px 0 0"><strong>Información solicitada:</strong> '+esc(c.detalle)+'</div>':'';const p1=c.estado_precalificacion||"SUBIDA",p2=c.estado_formalizacion||"";const statuses='<div class="case-meta"><div class="seller-stage-card"><span class="seller-stage-name">Precalificación</span><span class="seller-state '+sellerStateClass(p1)+'">'+esc(sellerStateLabel(p1))+'</span></div>'+(p2?'<div class="seller-stage-card"><span class="seller-stage-name">Formalización</span><span class="seller-state '+sellerStateClass(p2)+'">'+esc(sellerStateLabel(p2))+'</span></div>':'')+'</div>';return '<div class="case-row"><div><strong>'+esc(c.nombre||"Sin nombre")+'</strong><span class="muted">DPI '+esc(c.dpi||"")+'</span>'+statuses+detail+'</div><div class="case-actions"><button type="button" class="'+(a.edit?'yellow':'secondary')+'" data-open-case="'+esc(c.id)+'">'+a.label+'</button></div></div>'}).join(""):'<div class="muted">Todavía no tienes solicitudes.</div>';box.querySelectorAll("[data-open-case]").forEach(b=>b.addEventListener("click",()=>openExistingCase(b.dataset.openCase)))}
async function searchCases(){return loadSellerCases()}
function setStageEditable(stage,editable,requirement){const is1=stage==="stage1",form=is1?q("#preForm"):q("#stage2Form"),notice=is1?q("#stage1AdminNotice"):q("#stage2AdminNotice");if(form)form.querySelectorAll("input,select,textarea").forEach(el=>{if(el.type!=="hidden")el.disabled=!editable});if(is1){["dpiFront","dpiBack"].forEach(id=>{if(q("#"+id))q("#"+id).disabled=!editable});if(q("#analyzeBtn"))q("#analyzeBtn").disabled=!editable;if(q("#submitBtn"))q("#submitBtn").classList.toggle("hidden",!editable)}else{["stage2Selfie","stage2Utility","stage2Income"].forEach(id=>{if(q("#"+id))q("#"+id).disabled=!editable});if(q("#stage2AnalyzeBtn"))q("#stage2AnalyzeBtn").disabled=!editable;if(q("#finalSubmitBtn"))q("#finalSubmitBtn").classList.toggle("hidden",!editable)}if(notice){notice.classList.remove("hidden");notice.innerHTML=editable&&requirement?'<div class="notice warning"><strong>El administrador solicita corregir:</strong><br>'+esc(requirement)+'</div>':editable?'<div class="notice success"><strong>Captura habilitada.</strong> Completa y envía esta etapa.</div>':'<div class="lock-note"><strong>Solo lectura.</strong> El expediente está bloqueado para edición. Solo el administrador puede habilitar correcciones con “Requiere información”.</div>'}}
async function openExistingCase(id){
  const endpoint=adminMode?"/api/admin/cases/"+encodeURIComponent(id):"/api/seller/cases/"+encodeURIComponent(id);
  const r=await fetch(endpoint,{cache:"no-store"}),d=await r.json();
  if(!r.ok||!d.case){alert(d.error||"No se pudo abrir");if(adminMode&&r.status===401)location.href="/admin";return}
  const rec=d.case;currentRecordState=rec;currentPermissions=adminMode?{edit_stage1:rec.estado!=="RECHAZADA",start_stage2:rec.estado!=="RECHAZADA",edit_stage2:rec.estado!=="RECHAZADA",requirement:rec.ultimo_requerimiento||"",closed:rec.estado==="RECHAZADA"}:(d.permissions||{});currentCaseId=rec.id;currentSeller=rec.vendedor||sellerSession?.name||"";currentSellerId=rec.vendedor_id||sellerSession?.id||"";if(adminMode)sellerSession={id:currentSellerId,name:currentSeller};sentPayload=rec.stage1?.data||null;requestId=rec.stage1?.request_id||null;stage1Decision=rec.stage1?.decision||null;
  if(sentPayload){fillForm(q("#preForm"),sentPayload);syncProductUiFromForm();coverageLastResult=sentPayload?.informacion_complementaria?.cobertura_bda||null;refreshCoverageFromForm().catch(()=>{})}
  await restoreServerStage1Documents(rec);
  q("#cancelEditStage1")?.classList.remove("hidden");q("#cancelEditStage2")?.classList.remove("hidden");
  const closed=rec.estado==="RECHAZADA";
  if(rec.proceso==="FORMALIZACION DE CREDITO"){
    showOnly("screen2");configureStage2();q("#stage2FormCard").classList.add("hidden");
    if(rec.stage2?.data){fillForm(q("#stage2Form"),rec.stage2.data);q("#stage2Verified").checked=Boolean(rec.stage2.data?.control?.revision_humana)}
    const hasStoredStage2Read=Boolean(rec?.stage2?.extraction||rec?.stage2_draft?.extraction);
    applyStoredStage2Extraction(rec);
    await restoreServerStage2Documents(rec);
    if(hasStoredStage2Read||rec.stage2?.data)q("#stage2FormCard").classList.remove("hidden");
    setStageEditable("stage2",adminMode?!closed:Boolean(currentPermissions.start_stage2||currentPermissions.edit_stage2),adminMode?(closed?"Expediente rechazado y cerrado. Cambia el estado desde Administración para reabrirlo.":"Edición administrativa habilitada."):(currentPermissions.requirement||""));
    q("#pageTitle").textContent=adminMode?"CrediZas · Editar Formalización":"Solicitud fácil de crédito · Paso 2";q("#stage2AccessNotice").innerHTML=currentPermissions.requirement?'<div class="notice warning"><strong>Corrección solicitada:</strong> '+esc(currentPermissions.requirement)+'</div>':'';
  }else{
    showOnly("screen1");q("#formCard").classList.remove("hidden");setStageEditable("stage1",adminMode?!closed:Boolean(currentPermissions.edit_stage1),adminMode?(closed?"Expediente rechazado y cerrado. Cambia el estado desde Administración para reabrirlo.":"Edición administrativa habilitada."):(currentPermissions.requirement||""));q("#pageTitle").textContent=adminMode?"CrediZas · Editar Precalificación":"Solicitud fácil de crédito · Paso 1";
  }
  q("#pageSubtitle").textContent=adminMode?"Administración · "+currentSeller:"Revisa los datos del expediente.";updateStage1ValidationUI();updateStage2ValidationUI();
}

async function checkAdminWorkspace(){if(!adminMode)return false;const me=await fetch("/api/admin/me");if(!me.ok){location.href="/admin";return true}const sellersRes=await fetch("/api/admin/sellers"),sellersData=await sellersRes.json();if(adminCaseId){await openExistingCase(adminCaseId);q("#backHomeAfterStage1").textContent="Volver a Administración";return true}const seller=(sellersData.sellers||[]).find(x=>String(x.id)===String(adminSellerId));if(!seller){alert("Selecciona un vendedor desde el panel administrador.");location.href="/admin";return true}sellerSession=seller;currentSeller=seller.name;currentSellerId=seller.id;await clearCachedFiles();q("#preForm").reset();q("#stage2Form")?.reset();q("#selectedProduct")?.classList.add("hidden");q("#productSearch").value="";for(const k of Object.keys(preparedUploads))preparedUploads[k]=[];currentCaseId=crypto.randomUUID();sentPayload=null;requestId=null;stage1Decision=null;stage2Extraction=null;coverageLastResult=null;renderCoverageNotice(null);currentRecordState=null;currentPermissions={edit_stage1:true};showOnly("screen1");q("#cancelEditStage1")?.classList.add("hidden");q("#cancelEditStage2")?.classList.add("hidden");setStageEditable("stage1",true,"Edición administrativa habilitada.");q("#pageTitle").textContent="CrediZas · Nueva solicitud";q("#pageSubtitle").textContent="Administrador · Vendedor: "+seller.name;q("#backHomeAfterStage1").textContent="Volver a Administración";loadCoverageDepartments().catch(()=>{});return true}

function productCardHtml(name,sku,image,amount){const img=image?'<img src="'+esc(image)+'" alt="Producto">':'<div style="width:92px;height:92px;border:1px solid #d8e5dc;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;color:#98a2b3;font-weight:800">Sin imagen</div>';return '<div class="selected-product-card">'+img+'<div><div class="sp-name">'+esc(name||"")+'</div><div class="sp-sku">SKU: '+esc(sku||"N/D")+'</div><div class="sp-amount">Monto solicitado: '+catalogMoney(amount)+'</div></div></div>'}
function syncProductUiFromForm(){const name=q('[name="solicitud.producto_solicitado"]')?.value||"",sku=q('[name="solicitud.producto_sku"]')?.value||"",image=q('[name="solicitud.producto_imagen_url"]')?.value||"",amount=Number(q('[name="solicitud.monto_total_solicitado"]')?.value||0);if(!name)return;q("#productSearch").value=name;q("#selectedProduct").classList.remove("hidden");q("#selectedProduct").innerHTML=productCardHtml(name,sku,image,amount)}
let catalogTimer=null;
function catalogMoney(v){return "Q "+Number(v||0).toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2})}
async function searchCatalog(qry){const box=q("#productResults");if(!qry||qry.length<2){box.classList.add("hidden");return}const r=await fetch("/api/catalog?q="+encodeURIComponent(qry)),d=await r.json();if(!r.ok){box.innerHTML='<div class="notice bad">'+esc(d.error||"No se pudo consultar catálogo")+'</div>';box.classList.remove("hidden");return}const items=(d.data||[]).slice(0,20);box.innerHTML=items.length?items.map((p,i)=>'<div class="product-option" data-product-index="'+i+'">'+(p.imagen_principal_url?'<img src="'+esc(p.imagen_principal_url)+'" alt="">':'<div></div>')+'<div><div class="po-name">'+esc(p.nombre)+'</div><div class="po-meta">'+esc(p.sku||"")+" · "+esc(p.categoria||"")+'</div></div><div></div></div>').join(""):'<div class="notice">No se encontraron productos.</div>';box.classList.remove("hidden");box.querySelectorAll("[data-product-index]").forEach(el=>el.addEventListener("click",()=>selectCatalogProduct(items[Number(el.dataset.productIndex)])))}
function selectCatalogProduct(p){q('[name="solicitud.producto_solicitado"]').value=p.nombre||p.descripcion||"";q('[name="solicitud.producto_id"]').value=p.producto_id||"";q('[name="solicitud.producto_sku"]').value=p.sku||"";q('[name="solicitud.producto_imagen_url"]').value=p.imagen_principal_url||"";q('[name="solicitud.monto_total_solicitado"]').value=Number(p.monto_solicitado||0).toFixed(2);q("#productSearch").value=p.nombre||"";q("#selectedProduct").classList.remove("hidden");q("#selectedProduct").innerHTML=productCardHtml(p.nombre||"",p.sku||"",p.imagen_principal_url||"",Number(p.monto_solicitado||0));q("#productResults").classList.add("hidden");updateStage1ValidationUI();saveDraftSoon()}

const objectUrls=[];
function esc(v){return String(v??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[s]));}
function setProgress(n,state){for(let i=1;i<=4;i++){const e=q("#p"+i);if(!e)continue;e.className="pstep";if(i<n)e.classList.add("done");if(i===n)e.classList.add(state==="blocked"?"blocked":"active");}}
function goScreen2(){q("#screen1").classList.add("hidden");q("#screen2").classList.remove("hidden");q("#pageTitle").textContent="Solicitud fácil de crédito · Paso 2";q("#pageSubtitle").textContent="Ahora pide solo los documentos y datos que faltan.";configureStage2();window.scrollTo({top:0,behavior:"smooth"});}
function ext(name){const m=String(name||"").toLowerCase().match(/\.([a-z0-9]+)$/);return m?m[1]:"";}
function isPdf(file){return file?.type==="application/pdf"||ext(file?.name)==="pdf";}
function isImage(file){return String(file?.type||"").startsWith("image/")||["jpg","jpeg","png","webp","gif","bmp","tif","tiff","heic","heif","avif","jxl"].includes(ext(file?.name));}
async function decodeImage(file){try{const b=await createImageBitmap(file);return{width:b.width,height:b.height,draw(c,w,h){c.drawImage(b,0,0,w,h)},close(){b.close?.()}}}catch{}return await new Promise((resolve,reject)=>{const u=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,draw(c,w,h){c.drawImage(img,0,0,w,h)},close(){URL.revokeObjectURL(u)}});img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("El navegador no pudo abrir "+file.name+". Usa JPG, PNG, WEBP o PDF."))};img.src=u})}
async function prepareImage(file){const d=await decodeImage(file),max=2200,scale=Math.min(1,max/Math.max(d.width,d.height)),w=Math.max(1,Math.round(d.width*scale)),h=Math.max(1,Math.round(d.height*scale)),c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{alpha:false});if(!ctx){d.close();throw new Error("No se pudo preparar la imagen.")}ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);d.draw(ctx,w,h);d.close();const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9));if(!blob)throw new Error("No se pudo convertir "+file.name);const base=(file.name||"imagen").replace(/\.[^.]+$/,"" )||"imagen";return new File([blob],base+".jpg",{type:"image/jpeg",lastModified:Date.now()})}
async function prepareFiles(files){const out=[];for(const f of files){out.push(isImage(f)?await prepareImage(f):f)}return out;}
function objUrl(f){const u=URL.createObjectURL(f);objectUrls.push(u);return u;}
function isWord(f){return ["doc","docx"].includes(ext(f?.name))||["application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(String(f?.type||""));}
const wordHtmlCache=new Map();
async function wordHtml(f){if(wordHtmlCache.has(f))return wordHtmlCache.get(f);let value="";if(ext(f?.name)==="docx"&&window.mammoth){try{const arrayBuffer=await f.arrayBuffer();const result=await window.mammoth.convertToHtml({arrayBuffer:arrayBuffer});value=result.value||""}catch(e){value=""}}wordHtmlCache.set(f,value);return value;}
async function previewCard(f){const name=esc(f.name);if(String(f.type||"").startsWith("image/")){return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body"><img src="'+objUrl(f)+'"></div><div class="doc-preview-foot">Imagen</div></div>'}if(isPdf(f)){return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body"><iframe src="'+objUrl(f)+'#toolbar=0"></iframe></div><div class="doc-preview-foot">PDF</div></div>'}if(isWord(f)){const wh=await wordHtml(f);const body=wh?'<div class="word-preview">'+wh+'</div>':'<div class="word-fallback"><strong>WORD</strong><span>'+name+'</span></div>';return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body">'+body+'</div><div class="doc-preview-foot">Documento Word</div></div>'}return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body"><div class="word-fallback"><strong>DOCUMENTO</strong><span>'+name+'</span></div></div><div class="doc-preview-foot">Documento</div></div>'}
async function renderMulti(container,files){if(!files.length){container.innerHTML='<span class="muted">Sin archivos</span>';return}const cards=[];for(const f of files)cards.push(await previewCard(f));container.innerHTML=cards.join("");}
async function handleSingleImage(input,key,box,meta){const f=input.files?.[0];if(!f){preparedUploads[key]=[];await cacheFiles(key,[]);if(key.startsWith("stage2"))invalidateStage2Analysis();box.innerHTML='<span class="muted">Pendiente</span>';meta.textContent="Sin archivo";updateButtons();saveDraftSoon();return}meta.textContent="Preparando...";try{const p=await prepareImage(f);preparedUploads[key]=[p];await cacheFiles(key,[p]);if(key.startsWith("stage2"))invalidateStage2Analysis();box.innerHTML='<img src="'+objUrl(p)+'">';meta.textContent=f.name}catch(e){preparedUploads[key]=[];box.innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}updateButtons();saveDraftSoon();}
async function handleMulti(input,key,meta,container){const fs=[...(input.files||[])];if(!fs.length){preparedUploads[key]=[];await cacheFiles(key,[]);if(key.startsWith("stage2"))invalidateStage2Analysis();meta.textContent="Sin archivo";await renderMulti(container,[]);updateButtons();saveDraftSoon();return}meta.textContent="Preparando...";try{const ps=await prepareFiles(fs);preparedUploads[key]=ps;await cacheFiles(key,ps);if(key.startsWith("stage2"))invalidateStage2Analysis();meta.textContent=ps.map(f=>f.name).join(", ");await renderMulti(container,ps)}catch(e){preparedUploads[key]=[];container.innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}updateButtons();saveDraftSoon();}
q("#dpiFront").addEventListener("change",e=>handleSingleImage(e.target,"dpiFront",q("#prevDpiFront"),q("#metaDpiFront")));
q("#dpiBack").addEventListener("change",e=>handleSingleImage(e.target,"dpiBack",q("#prevDpiBack"),q("#metaDpiBack")));
q("#stage2Selfie").addEventListener("change",e=>handleSingleImage(e.target,"stage2Selfie",q("#prevStage2Selfie"),q("#metaStage2Selfie")));
q("#stage2Utility").addEventListener("change",e=>handleMulti(e.target,"stage2Utility",q("#metaStage2Utility"),q("#previewStage2Utility")));
q("#stage2Income").addEventListener("change",e=>handleMulti(e.target,"stage2Income",q("#metaStage2Income"),q("#previewStage2Income")));

q("#homeBtn")?.addEventListener("click",goHome);
q("#sellerLoginPin")?.addEventListener("input",e=>only4(e.target));q("#newSellerPin")?.addEventListener("input",e=>only4(e.target));q("#newSellerPin2")?.addEventListener("input",e=>only4(e.target));
q("#sellerLoginBtn")?.addEventListener("click",sellerLogin);q("#registerSellerBtn")?.addEventListener("click",registerSeller);q("#sellerLogoutBtn")?.addEventListener("click",sellerLogout);
q("#newCaseBtn")?.addEventListener("click",async()=>{if(!sellerSession)return;await clearCachedFiles();q("#preForm").reset();q("#stage2Form")?.reset();q("#selectedProduct")?.classList.add("hidden");q("#productSearch").value="";for(const k of Object.keys(preparedUploads))preparedUploads[k]=[];currentCaseId=crypto.randomUUID();currentSeller=sellerSession.name;currentSellerId=sellerSession.id;sentPayload=null;requestId=null;stage1Decision=null;stage2Extraction=null;coverageLastResult=null;renderCoverageNotice(null);currentRecordState=null;currentPermissions={edit_stage1:true};stage2AnalyzedSignature="";showOnly("screen1");q("#cancelEditStage1")?.classList.add("hidden");q("#cancelEditStage2")?.classList.add("hidden");setStageEditable("stage1",true,"");q("#pageTitle").textContent="Solicitud fácil de crédito · Paso 1";q("#pageSubtitle").textContent="Sube el DPI, revisa los datos y completa lo que falta.";loadCoverageDepartments().catch(()=>{});saveDraftSoon()});
q("#caseSearchBtn")?.addEventListener("click",searchCases);q("#caseSearchInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchCases()});q("#resumeDraftBtn")?.addEventListener("click",resumeDraft);q("#backHomeAfterStage1")?.addEventListener("click",goHome);
q("#productSearch")?.addEventListener("input",e=>{clearTimeout(catalogTimer);catalogTimer=setTimeout(()=>searchCatalog(e.target.value.trim()),250)});
document.addEventListener("click",e=>{if(!e.target.closest(".product-search-wrap"))q("#productResults")?.classList.add("hidden")});
q("#preForm")?.addEventListener("input",saveDraftSoon);q("#preForm")?.addEventListener("change",saveDraftSoon);q("#stage2Form")?.addEventListener("input",saveDraftSoon);q("#stage2Form")?.addEventListener("change",saveDraftSoon);

function updateButtons(){const ready1=preparedUploads.dpiFront.length===1&&preparedUploads.dpiBack.length===1,canEdit1=!currentRecordState||Boolean(currentPermissions.edit_stage1);q("#analyzeBtn").disabled=!ready1||!canEdit1;q("#uploadStatus").className="notice "+(ready1?"success":"warning");q("#uploadStatus").innerHTML=ready1?"<strong>¡Muy bien!</strong> Ya puedes leer los datos del DPI.":"Sube primero las dos fotos del DPI: enfrente y atrás.";if(sentPayload){const pol=stage2Policy(),ready2=preparedUploads.stage2Selfie.length===1&&preparedUploads.stage2Utility.length>=1&&(!pol.required||preparedUploads.stage2Income.length>=1),same=ready2&&stage2AnalyzedSignature&&stage2AnalyzedSignature===stage2Signature(),canEdit2=Boolean(currentPermissions.start_stage2||currentPermissions.edit_stage2);q("#stage2AnalyzeBtn").disabled=!ready2||same||!canEdit2;const missing=[];if(!preparedUploads.stage2Selfie.length)missing.push("selfie con DPI");if(!preparedUploads.stage2Utility.length)missing.push("documento de domicilio");if(pol.required&&!preparedUploads.stage2Income.length)missing.push("sustento de ingresos");q("#stage2DocsStatus").className="notice "+(ready2?"success":"warning");q("#stage2DocsStatus").innerHTML=same?"<strong>Documentos ya leídos.</strong> El botón se habilitará de nuevo si cargas o cambias algún archivo.":ready2?"<strong>Documentos completos.</strong> Ya puedes leerlos con IA.":"<strong>Falta:</strong> "+missing.join(" · ");}}
const incomeRules={SALARIO:{origins:["SALARIO FORMAL","SALARIO INFORMAL"],subtype:{"SALARIO FORMAL":"CON DESCUENTO IGSS","SALARIO INFORMAL":"SIN DESCUENTO IGSS"}},RENTAS:{origins:["REMESAS","JUBILADO"],subtype:{REMESAS:"REMESAS",JUBILADO:"JUBILADO"}},VENTAS:{origins:["INDEPENDIENTE FORMAL","INDEPENDIENTE INFORMAL"],subtype:{"INDEPENDIENTE FORMAL":"AMBULANTE","INDEPENDIENTE INFORMAL":"OFICIO MENOR"}}};
function rebuildIncomeOrigin(){const s=q('[name="informacion_complementaria.fuente_ingresos"]'),o=q('[name="informacion_complementaria.origen_ingresos"]'),t=q('[name="informacion_complementaria.subtipo_ingreso"]');o.innerHTML='<option value="">Seleccionar</option>';t.innerHTML='<option value="">Seleccionar origen primero</option>';const r=incomeRules[s.value];r?.origins.forEach(v=>{const x=document.createElement("option");x.value=v;x.textContent=v;o.appendChild(x)})}
function rebuildIncomeSubtype(){const s=q('[name="informacion_complementaria.fuente_ingresos"]').value,o=q('[name="informacion_complementaria.origen_ingresos"]').value,t=q('[name="informacion_complementaria.subtipo_ingreso"]');t.innerHTML='<option value="">Seleccionar</option>';const v=incomeRules[s]?.subtype?.[o];if(v){const x=document.createElement("option");x.value=v;x.textContent=v;t.appendChild(x);t.value=v}}
q('[name="informacion_complementaria.fuente_ingresos"]').addEventListener("change",rebuildIncomeOrigin);q('[name="informacion_complementaria.origen_ingresos"]').addEventListener("change",rebuildIncomeSubtype);
q("#preForm").addEventListener("input",updateStage1ValidationUI);q("#preForm").addEventListener("change",updateStage1ValidationUI);q("#stage2Form").addEventListener("input",updateStage2ValidationUI);q("#stage2Form").addEventListener("change",updateStage2ValidationUI);
function setDeep(obj,path,value){const parts=path.split(".");let cur=obj;for(let i=0;i<parts.length;i++){const k=parts[i],last=i===parts.length-1,next=parts[i+1],nextIndex=next!==undefined&&/^\d+$/.test(next);if(last){cur[k]=value;return}if(cur[k]===undefined)cur[k]=nextIndex?[]:{};if(nextIndex){const n=Number(next);if(!cur[k][n])cur[k][n]={};cur=cur[k][n];i++}else cur=cur[k]}}
function collect(form){const out={};form.querySelectorAll("[name]").forEach(el=>{if(el.closest(".hidden"))return;let v=el.value;if(v==="")v=null;else if(el.type==="number")v=Number(v);setDeep(out,el.name,v)});return out;}
function applyExtraction(fields,form){for(const item of fields||[]){const el=visibleNamedField(form,item.key);if(!el)continue;const v=item.normalized_value??item.value??"";if(v!==null&&v!==undefined)el.value=el.type==="tel"?digits8(v):v;const wrap=el.closest(".field");if(wrap){wrap.classList.remove("ai-found","ai-uncertain","ai-conflict");wrap.classList.add(item.status==="conflict"?"ai-conflict":item.status==="uncertain"?"ai-uncertain":"ai-found");const m=wrap.querySelector(".field-meta");if(m)m.textContent=(item.status==="found"?"IA ":"Revisar ")+Math.round((item.confidence||0)*100)+"%"}}}
const STAGE1_REQUIRED=[
  "datos_basicos.nombre_completo","datos_basicos.numero_dpi","datos_basicos.fecha_nacimiento","datos_basicos.nit","datos_basicos.numero_celular","datos_basicos.estado_civil","datos_basicos.genero",
  "solicitud.producto_solicitado","solicitud.monto_total_solicitado","informacion_complementaria.ingreso_promedio_mensual","informacion_complementaria.fuente_ingresos","informacion_complementaria.origen_ingresos","informacion_complementaria.subtipo_ingreso","informacion_complementaria.tipo_vivienda","informacion_complementaria.departamento","informacion_complementaria.municipio","informacion_complementaria.nivel_educacion"
];
function fieldLabel(el){return el?.closest(".field")?.querySelector("label")?.textContent?.replace(/\s*\*\s*$/,"" ).trim()||el?.name||"Campo";}
function fieldValid(el,name){if(!el)return false;const v=String(el.value??"").trim();if(!v)return false;if(el.type==="number")return Number(v)>0;if(el.type==="tel")return validPhone(v);return true;}
function paintField(el,valid){const f=el?.closest(".field");if(!f)return;f.classList.toggle("valid-state",!!valid);f.classList.toggle("invalid-state",!valid);}
function updateStage1ValidationUI(){const missing=[];for(const name of STAGE1_REQUIRED){const el=q('[name="'+CSS.escape(name)+'"]'),ok=fieldValid(el,name);paintField(el,ok);if(!ok)missing.push(fieldLabel(el))}const estado=q('[name="datos_basicos.estado_civil"]')?.value||"",spouse=q('[name="datos_basicos.nombre_conyuge"]');if(estado==="CASADO"){const ok=fieldValid(spouse,"datos_basicos.nombre_conyuge");paintField(spouse,ok);if(!ok)missing.push("Nombre del cónyuge")}else if(spouse){spouse.closest(".field")?.classList.remove("invalid-state","valid-state")}const box=q("#stage1ValidationBox");if(box){box.className="validation-box"+(missing.length?"":" ok");box.innerHTML=missing.length?"<strong>Información faltante:</strong> "+missing.map(esc).join(" · "):"<strong>✓ Datos completos.</strong> Ya puedes enviar el Paso 1."}return missing;}
function stage2RequiredNames(){const base=["domicilio.direccion_completa"];const work=stage2Group()==="company"?["digitacion.nombre_empresa","digitacion.direccion_empresa","digitacion.telefono_empresa","digitacion.antiguedad"]:["digitacion.giro_oficio","digitacion.direccion_empresa","digitacion.telefono_empresa","digitacion.antiguedad"];const refs=[];for(let i=0;i<3;i++)refs.push("referencias."+i+".nombre_completo","referencias."+i+".parentesco","referencias."+i+".celular");return base.concat(work,refs);}
function updateStage2ValidationUI(){const missing=[];for(const name of stage2RequiredNames()){const el=visibleNamedField(q("#stage2Form"),name),ok=fieldValid(el,name);paintField(el,ok);if(!ok)missing.push(fieldLabel(el))}const box=q("#stage2ValidationBox");if(box){box.className="validation-box"+(missing.length?"":" ok");box.innerHTML=missing.length?"<strong>Información faltante:</strong> "+missing.map(esc).join(" · "):"<strong>✓ Datos completos.</strong> El expediente está listo para revisar y enviar."}return missing;}
function stage2Policy(){const s=sentPayload?.informacion_complementaria?.fuente_ingresos,o=sentPayload?.informacion_complementaria?.origen_ingresos;if(s==="SALARIO"&&o==="SALARIO FORMAL")return{required:true,label:"Pide constancia/carta laboral, boleta u otro respaldo."};if(s==="RENTAS"&&o==="JUBILADO")return{required:true,label:"Pide constancia o comprobante de jubilación/pensión."};if(s==="VENTAS"&&o==="INDEPENDIENTE FORMAL")return{required:true,label:"Constancia de ingresos obligatoria."};if(s==="VENTAS"&&o==="INDEPENDIENTE INFORMAL")return{required:false,label:"No presenta sustento de ingresos."};if(s==="SALARIO"&&o==="SALARIO INFORMAL")return{required:false,label:"No requiere constancia de ingresos."};if(s==="RENTAS"&&o==="REMESAS")return{required:false,label:"No requiere constancia de ingresos."};return{required:false,label:"No se requiere sustento."}}
function stage2Group(){const s=sentPayload?.informacion_complementaria?.fuente_ingresos,o=sentPayload?.informacion_complementaria?.origen_ingresos;return (s==="SALARIO"&&o==="SALARIO FORMAL")||(s==="RENTAS"&&o==="JUBILADO")?"company":"activity";}
function configureStage2(){const c=sentPayload?.informacion_complementaria||{},p=stage2Policy(),g=stage2Group();let summary='<div class="summary-chip"><strong>Ingresos</strong><br>'+esc(c.fuente_ingresos||"")+" → "+esc(c.origen_ingresos||"")+" → "+esc(c.subtipo_ingreso||"")+'</div><div class="summary-chip"><strong>Ingreso promedio mensual</strong><br>Q '+esc(c.ingreso_promedio_mensual??"")+'</div>';if(p.required)summary+='<div class="summary-chip"><strong>Sustento requerido</strong><br>'+esc(p.label)+'</div>';q("#stage2Summary").innerHTML=summary;q("#stage2IncomeCard").classList.toggle("hidden",!p.required);q("#stage2IncomeTitle").textContent="SUSTENTO DE INGRESOS *";q("#stage2IncomeHelp").textContent=p.required?p.label:"";if(!p.required){preparedUploads.stage2Income=[];q("#stage2Income").value="";q("#metaStage2Income").textContent="";q("#previewStage2Income").innerHTML=""}q("#companyGroup").classList.toggle("hidden",g!=="company");q("#activityGroup").classList.toggle("hidden",g!=="activity");if(g==="company"){const o=c.origen_ingresos;q("#companyGroupTitle").textContent=o==="JUBILADO"?"Datos de institución / jubilación":"Datos de la empresa";q("#companyGuide").textContent=o==="JUBILADO"?"Pregunta nombre de institución/entidad, dirección, teléfono y tiempo como jubilado.":"Pregunta nombre de empresa, dirección, teléfono y antigüedad laboral."}if(g==="activity"){const d=q('[name="digitacion.direccion_empresa"]'),t=q('[name="digitacion.telefono_empresa"]');if(d&&!d.value)d.placeholder="Si no tiene local, usa el domicilio del cliente";if(t&&!t.value)t.value=sentPayload?.datos_basicos?.numero_celular||""}updateButtons();updateStage2ValidationUI();}
function buildStage1Payload(){const p=collect(q("#preForm"));p.expediente={id:currentCaseId||crypto.randomUUID(),vendedor:currentSeller||sellerSession?.name||"",vendedor_id:currentSellerId||sellerSession?.id||""};delete p.control_etapa1;currentCaseId=p.expediente.id;currentSeller=p.expediente.vendedor;p.documentos={dpi_foto:preparedUploads.dpiFront[0]?.name||null,dpi_reverso:preparedUploads.dpiBack[0]?.name||null};p.informacion_complementaria=p.informacion_complementaria||{};p.informacion_complementaria.cobertura_bda=coverageLastResult||p.informacion_complementaria.cobertura_bda||null;p.control={revision_humana:q("#verified").checked,dpi_calidad:extracted?.dpi_quality||null,advertencias_ia:extracted?.warnings||[]};return p;}
function validateRefs(p){const refs=p.referencias||[];if(refs.length<3)return"Debes completar las 3 referencias.";for(let i=0;i<3;i++){const r=refs[i]||{},n=i+1;if(!r.nombre_completo||!r.parentesco||!r.celular)return"Referencia "+n+": completa nombre, parentesco y celular.";if(!validPhone(r.celular))return"Referencia "+n+": el celular debe tener exactamente 8 dígitos.";const rel=String(r.parentesco).toUpperCase();if(rel.includes("CONYUGE")||rel.includes("CÓNYUGE")||rel.includes("ESPOS"))return"Referencia "+n+": el cónyuge no puede ser referencia.";if(r.mayor_edad_confirmado!=="SI"||r.mismo_domicilio!=="NO"||r.certifica_datos!=="SI"||r.localizable!=="SI")return"Referencia "+n+": no cumple las reglas obligatorias de referencia."}return null;}
function buildStage2Payload(){const p=collect(q("#stage2Form"));p.expediente={id:currentCaseId,vendedor:currentSeller||sellerSession?.name||"",vendedor_id:currentSellerId||sellerSession?.id||""};delete p.control_etapa2;p.documentos={selfie_con_dpi:preparedUploads.stage2Selfie[0]?.name||null,domicilio:preparedUploads.stage2Utility.map(f=>f.name),sustento_ingresos:stage2Policy().required?preparedUploads.stage2Income.map(f=>f.name):[]};p.control={revision_humana:q("#stage2Verified").checked,selfie_check:stage2Extraction?.selfie_check||null,domicile_consistency:stage2Extraction?.domicile_consistency||null,income_consistency:stage2Extraction?.income_consistency||null,advertencias_ia:stage2Extraction?.warnings||[]};return p;}
function requirePdfLibraries(){if(!window.jspdf||!window.jspdf.jsPDF)throw new Error("No se pudo cargar el generador PDF. Revisa la conexión a Internet e intenta de nuevo.");if(window.pdfjsLib)window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";}
function pdfValue(v){if(v===null||v===undefined||v==="")return "No indicado";return String(v);}
function pdfMoney(v){const n=Number(v);return Number.isFinite(n)?"Q "+n.toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2}):pdfValue(v);}
function pdfClientName(v){return String(v||"cliente").replace(/[<>:"/\\|?*\u0000-\u001F]/g," ").replace(/\s+/g," ").trim()||"cliente";}
function pdfToday(){const d=new Date(),p=n=>String(n).padStart(2,"0");return p(d.getDate())+"/"+p(d.getMonth()+1)+"/"+d.getFullYear();}
function pdfHeader(doc,title){doc.setFillColor(24,111,122);doc.rect(0,0,210,25,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(19);doc.text("CrediZas",12,10);doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(title,12,17);doc.text("Fecha: "+pdfToday(),198,10,{align:"right"});doc.setTextColor(23,32,51);return 31;}
function pdfCompactText(doc,value,w){doc.setFont("helvetica","normal");doc.setFontSize(7.2);let lines=doc.splitTextToSize(pdfValue(value),w-6);if(lines.length>3){lines=lines.slice(0,3);let last=String(lines[2]);if(last.length>3)last=last.slice(0,-3)+"...";lines[2]=last}return lines;}
function pdfCompactCard(doc,label,value,x,y,w,h=13){doc.setFillColor(247,250,252);doc.setDrawColor(211,222,230);doc.roundedRect(x,y,w,h,1.2,1.2,"FD");doc.setFont("helvetica","bold");doc.setFontSize(5.8);doc.setTextColor(99,115,129);doc.text(String(label).toUpperCase(),x+3,y+3.8);doc.setTextColor(23,32,51);const lines=pdfCompactText(doc,value,w);doc.text(lines,x+3,y+7.2,{lineHeightFactor:1});}
function pdfCompactSection(doc,title,fields,y){doc.setFont("helvetica","bold");doc.setFontSize(8.6);doc.setTextColor(24,111,122);doc.text(title,12,y);doc.setDrawColor(200,214,224);doc.line(12,y+1.8,198,y+1.8);y+=4.5;const xs=[12,75.5,139],w=59;for(let i=0;i<fields.length;i+=3){let h=13;for(let j=0;j<3;j++){const f=fields[i+j];if(!f)continue;const lines=pdfCompactText(doc,f[1],w);if(lines.length>=3)h=15}for(let j=0;j<3;j++){const f=fields[i+j];if(f)pdfCompactCard(doc,f[0],f[1],xs[j],y,w,h)}y+=h+2}return y+2;}
function pdfFooterOne(doc,page,total){doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(110,120,130);doc.text("Documento confidencial - Uso interno",12,290);doc.text("Página "+page+" de "+total,198,290,{align:"right"});}
function fileDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("No se pudo leer "+file.name));r.readAsDataURL(file)})}
async function pdfImageBox(doc,file,label,x,y,w,h){doc.setFillColor(247,250,252);doc.setDrawColor(211,222,230);doc.roundedRect(x,y,w,h,1.5,1.5,"FD");doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(99,115,129);doc.text(label,x+4,y+6);if(!file){doc.setFont("helvetica","normal");doc.text("No disponible",x+4,y+14);return}try{const data=await fileDataUrl(file);const props=doc.getImageProperties(data);const maxW=w-8,maxH=h-16,ratio=Math.min(maxW/props.width,maxH/props.height);const iw=props.width*ratio,ih=props.height*ratio;doc.addImage(data,"JPEG",x+(w-iw)/2,y+10+(maxH-ih)/2,iw,ih,undefined,"FAST")}catch(e){doc.setFont("helvetica","normal");doc.setTextColor(180,50,40);doc.text("No se pudo insertar: "+file.name,x+4,y+14)}}
async function pdfAddDpiPage(doc,title){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(24,111,122);doc.text("Documento Personal de Identificación",12,34);await pdfImageBox(doc,preparedUploads.dpiFront[0],"DPI - frente",12,40,88,130);await pdfImageBox(doc,preparedUploads.dpiBack[0],"DPI - reverso",110,40,88,130);}
async function renderSourcePdf(file){if(!window.pdfjsLib)return[];const bytes=new Uint8Array(await file.arrayBuffer());const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise;const out=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const viewport=page.getViewport({scale:1.35});const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext("2d"),viewport:viewport}).promise;out.push(canvas.toDataURL("image/jpeg",.9))}return out;}
function pdfAddRenderedPage(doc,data,title,pageLabel){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(24,111,122);doc.text(pageLabel,12,34);const props=doc.getImageProperties(data),maxW=186,maxH=244,ratio=Math.min(maxW/props.width,maxH/props.height),w=props.width*ratio,h=props.height*ratio;doc.addImage(data,"JPEG",12+(186-w)/2,39,w,h,undefined,"FAST");}
function htmlToPlainText(html){const d=document.createElement("div");d.innerHTML=html||"";return (d.innerText||d.textContent||"").replace(/\n{3,}/g,"\n\n").trim();}
async function pdfAddWordDocument(doc,file,title,label){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(24,111,122);doc.text(label,12,34);doc.setFillColor(236,244,255);doc.setDrawColor(95,145,210);doc.roundedRect(12,39,186,18,2,2,"FD");doc.setFontSize(13);doc.setTextColor(35,90,160);doc.text("WORD",18,50);doc.setFontSize(8);doc.setTextColor(23,32,51);doc.text(file.name,42,49);let body="";if(ext(file.name)==="docx")body=htmlToPlainText(await wordHtml(file));if(!body){doc.setFontSize(8.5);doc.setTextColor(90,100,115);doc.text("Documento Word cargado. El formato legado .doc se representa en el expediente por su ficha y nombre de archivo.",12,66,{maxWidth:186});return}doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(23,32,51);const lines=doc.splitTextToSize(body,184);let y=65;for(let i=0;i<lines.length;i++){if(y>282){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(23,32,51);y=34}doc.text(lines[i],13,y);y+=3.6}}
async function pdfAddUploadedDocument(doc,file,title,label){if(!file)return;if(isImage(file)){const data=await fileDataUrl(file);pdfAddRenderedPage(doc,data,title,label);return}if(isPdf(file)){try{const pages=await renderSourcePdf(file);if(pages.length){for(let i=0;i<pages.length;i++)pdfAddRenderedPage(doc,pages[i],title,label+" · página "+(i+1));return}}catch(e){}doc.addPage();pdfHeader(doc,title);doc.setFontSize(10);doc.text(label+": "+file.name,12,38);return}if(isWord(file)){await pdfAddWordDocument(doc,file,title,label);return}doc.addPage();pdfHeader(doc,title);doc.setFontSize(10);doc.text(label+": "+file.name,12,38);doc.setFontSize(8);doc.setTextColor(100,110,120);doc.text("Documento adjunto. Este formato se identifica por nombre dentro del expediente.",12,46);}
function pdfFooters(doc){const total=doc.getNumberOfPages();for(let i=1;i<=total;i++){doc.setPage(i);pdfFooterOne(doc,i,total)}}
function stage1PdfStatus(){return stage1Decision?.status?String(stage1Decision.status).toUpperCase():"PENDING";}
async function persistPdf(kind,doc){if(!currentCaseId)return;try{const blob=doc.output("blob");await fetch("/api/cases/"+encodeURIComponent(currentCaseId)+"/pdf/"+kind,{method:"PUT",headers:{"content-type":"application/pdf"},body:blob})}catch{}}
async function downloadStage1Pdf(onlyPersist=false){requirePdfLibraries();const p=sentPayload||buildStage1Payload(),b=p.datos_basicos||{},c=p.informacion_complementaria||{},s=p.solicitud||{},doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),title="Expediente de precalificación de crédito - Paso 1";let y=pdfHeader(doc,title);y=pdfCompactSection(doc,"PASO 1 - DATOS BÁSICOS",[["Nombres y apellidos",b.nombre_completo],["DPI",b.numero_dpi],["NIT",b.nit],["Fecha de nacimiento",b.fecha_nacimiento],["Celular",b.numero_celular],["Estado civil",b.estado_civil],["Cónyuge",b.nombre_conyuge],["Género",b.genero]],y);y=pdfCompactSection(doc,"SOLICITUD",[["Producto de interés",b.producto_interes],["Producto solicitado",s.producto_solicitado],["Monto total solicitado",pdfMoney(s.monto_total_solicitado)],["Ingreso promedio mensual",pdfMoney(c.ingreso_promedio_mensual)]],y);y=pdfCompactSection(doc,"INFORMACIÓN COMPLEMENTARIA",[["Fuente de ingresos",c.fuente_ingresos],["Origen de ingresos",c.origen_ingresos],["Subtipo de ingreso",c.subtipo_ingreso],["Nacionalidad",c.tipo_nacionalidad],["Tipo de vivienda",c.tipo_vivienda],["Departamento",c.departamento],["Municipio",c.municipio],["Poblado",c.poblado||"No indicado"],["Cobertura BDA",c.cobertura_bda?.label||"No evaluada"],["Regla BDA",c.cobertura_bda?.detail||"Sin detalle"],["Nivel de educación",c.nivel_educacion]],y);y=pdfCompactSection(doc,"RESULTADO / CONTROL",[["Estado",stage1PdfStatus()],["Solicitud",requestId||"No asignada"]],y);await pdfAddDpiPage(doc,title);pdfFooters(doc);await persistPdf("stage1",doc);if(!onlyPersist)doc.save(pdfClientName(b.nombre_completo)+".pdf");}
function validateStage2ForPdf(){if(!sentPayload)return"Primero completa el Paso 1.";const s2=buildStage2Payload(),g=stage2Group(),d=s2.domicilio||{},dig=s2.digitacion||{};if(!d.direccion_completa)return"Hace falta la dirección completa.";if(g==="company"){for(const k of ["nombre_empresa","direccion_empresa","telefono_empresa","antiguedad"])if(!dig[k])return"Completa todos los datos de empresa/institución."}else{for(const k of ["giro_oficio","direccion_empresa","telefono_empresa","antiguedad"])if(!dig[k])return"Completa todos los datos de la actividad/oficio."}const refErr=validateRefs(s2);if(refErr)return refErr;if(!q("#stage2Verified").checked)return"Marca la confirmación de revisión antes de generar el PDF.";return null;}
async function downloadFinalPdf(onlyPersist=false){const err=validateStage2ForPdf();if(err){alert(err);return}requirePdfLibraries();const s1=sentPayload,s2=buildStage2Payload(),b=s1.datos_basicos||{},c=s1.informacion_complementaria||{},s=s1.solicitud||{},d=s2.domicilio||{},dig=s2.digitacion||{},doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),title="Expediente completo de crédito";let y=pdfHeader(doc,title);y=pdfCompactSection(doc,"PASO 1 - PRECALIFICACIÓN",[["Nombres y apellidos",b.nombre_completo],["DPI",b.numero_dpi],["NIT",b.nit],["Fecha nacimiento",b.fecha_nacimiento],["Celular",b.numero_celular],["Estado civil",b.estado_civil],["Cónyuge",b.nombre_conyuge],["Género",b.genero],["Producto solicitado",s.producto_solicitado],["Monto solicitado",pdfMoney(s.monto_total_solicitado)],["Ingreso promedio",pdfMoney(c.ingreso_promedio_mensual)],["Vivienda",c.tipo_vivienda],["Ingresos",pdfValue(c.fuente_ingresos)+" / "+pdfValue(c.origen_ingresos)+" / "+pdfValue(c.subtipo_ingreso)],["Departamento",c.departamento],["Municipio",c.municipio],["Poblado",c.poblado||"No indicado"],["Cobertura BDA",c.cobertura_bda?.label||"No evaluada"],["Regla BDA",c.cobertura_bda?.detail||"Sin detalle"],["Educación",c.nivel_educacion]],y);y=pdfCompactSection(doc,"PASO 2 - DOMICILIO",[["Dirección completa",d.direccion_completa]],y);const workFields=stage2Group()==="company"?[["Empresa / institución",dig.nombre_empresa],["Dirección",dig.direccion_empresa],["Teléfono",dig.telefono_empresa],["Antigüedad",dig.antiguedad]]:[["Giro / actividad / oficio",dig.giro_oficio],["Dirección de actividad",dig.direccion_empresa],["Teléfono de actividad",dig.telefono_empresa],["Antigüedad",dig.antiguedad]];y=pdfCompactSection(doc,"PASO 2 - ACTIVIDAD / INGRESOS",workFields,y);const refs=s2.referencias||[];for(let i=0;i<3;i++){const r=refs[i]||{};y=pdfCompactSection(doc,"REFERENCIA "+(i+1),[["Nombre completo",r.nombre_completo],["Parentesco",r.parentesco],["Celular",r.celular],["Mayor de edad","SI"],["Vive con el cliente","NO"],["Confirma domicilio/datos laborales","SI"],["Localizable","SI"]],y)}await pdfAddDpiPage(doc,title);await pdfAddUploadedDocument(doc,preparedUploads.stage2Selfie[0],title,"Selfie del cliente sosteniendo DPI");for(let i=0;i<preparedUploads.stage2Utility.length;i++)await pdfAddUploadedDocument(doc,preparedUploads.stage2Utility[i],title,"Documento de domicilio "+(i+1));if(stage2Policy().required)for(let i=0;i<preparedUploads.stage2Income.length;i++)await pdfAddUploadedDocument(doc,preparedUploads.stage2Income[i],title,"Sustento de ingresos "+(i+1));pdfFooters(doc);await persistPdf("final",doc);finalPayloadCache={workflow:{initial_validation:{result:"approved_by_admin",request_id:requestId},reviewed_by_user:true,submitted_at:new Date().toISOString()},stage1:s1,stage2:s2};if(!onlyPersist)doc.save(pdfClientName(b.nombre_completo)+".pdf");}
q("#analyzeBtn").addEventListener("click",async()=>{const b=q("#analyzeBtn");b.disabled=true;b.innerHTML='<span class="spinner"></span> Leyendo los datos del DPI...';q("#extractMsg").innerHTML="";try{const fd=new FormData();fd.append("dpi_front",preparedUploads.dpiFront[0],preparedUploads.dpiFront[0].name);fd.append("dpi_back",preparedUploads.dpiBack[0],preparedUploads.dpiBack[0].name);const r=await fetch("/api/stage1/extract",{method:"POST",body:fd}),raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw new Error("El servidor devolvió una respuesta no válida: "+raw.slice(0,250))}if(!r.ok||!data.ok)throw new Error(data.error||"No se pudieron leer los datos del DPI.");extracted=data.extraction;q("#formCard").classList.remove("hidden");applyExtraction(extracted.fields,q("#preForm"));q('[name="datos_basicos.producto_interes"]').value="CCO ELECTRO";q('[name="datos_basicos.dpi_foto"]').value=preparedUploads.dpiFront[0]?.name||"";q('[name="informacion_complementaria.tipo_nacionalidad"]').value="GUATEMALA";const dq=extracted.dpi_quality,problems=!dq?.anverso_legible||!dq?.reverso_legible||dq?.vigencia==="vencido";q("#qualityBadge").className="badge "+(problems?"warn":"ok");q("#qualityBadge").textContent=problems?"Revisar DPI":"DPI verificado";q("#qualityBox").innerHTML='<div class="notice '+(problems?'warning':'success')+'"><strong>Revisión del DPI</strong><br>Anverso legible: '+(dq?.anverso_legible?'Sí':'No')+' · Reverso legible: '+(dq?.reverso_legible?'Sí':'No')+' · Vigencia: '+esc(dq?.vigencia||'no_determinado')+'</div>';q("#extractMsg").innerHTML='<div class="notice success"><strong>¡Listo!</strong> Revisa los datos y completa lo que falte.</div>';updateStage1ValidationUI();setProgress(2);q("#formCard").scrollIntoView({behavior:"smooth"})}catch(e){q("#extractMsg").innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}finally{b.textContent="Leer datos del DPI";updateButtons()}});
q("#showJsonBtn").addEventListener("click",()=>{q("#jsonPreview").textContent=JSON.stringify(buildStage1Payload(),null,2);q("#jsonPreview").classList.toggle("hidden")});
q("#preForm").addEventListener("submit",async e=>{e.preventDefault();await checkCoverageNow();const p=buildStage1Payload(),b=p.datos_basicos||{},c=p.informacion_complementaria||{},s=p.solicitud||{};for(const [k,l] of [["nombre_completo","Nombre completo"],["numero_dpi","Número de DPI"],["fecha_nacimiento","Fecha de nacimiento"],["nit","NIT"],["numero_celular","Celular"],["estado_civil","Estado civil"],["genero","Género"]])if(!b[k]){q("#submitMsg").innerHTML='<div class="notice bad">Hace falta: '+esc(l)+'.</div>';return}if(!validPhone(b.numero_celular)){q("#submitMsg").innerHTML='<div class="notice bad">El celular del cliente debe tener exactamente 8 dígitos.</div>';return}if(b.estado_civil==="CASADO"&&!b.nombre_conyuge){q("#submitMsg").innerHTML='<div class="notice bad">Ingresa el nombre del cónyuge.</div>';return}if(!s.producto_solicitado||!s.producto_sku){q("#submitMsg").innerHTML='<div class="notice bad">Selecciona el producto desde el catálogo ZasHome.</div>';return}if(!(Number(s.monto_total_solicitado)>0)){q("#submitMsg").innerHTML='<div class="notice bad">Ingresa un monto solicitado válido.</div>';return}if(!(Number(c.ingreso_promedio_mensual)>0)){q("#submitMsg").innerHTML='<div class="notice bad">Ingresa el ingreso promedio mensual del cliente.</div>';return}for(const [k,l] of [["fuente_ingresos","Fuente de ingresos"],["origen_ingresos","Origen de ingresos"],["subtipo_ingreso","Subtipo de ingreso"],["tipo_vivienda","Tipo de vivienda"],["departamento","Departamento"],["municipio","Municipio"],["nivel_educacion","Nivel de educación"]])if(!c[k]){q("#submitMsg").innerHTML='<div class="notice bad">Hace falta: '+esc(l)+'.</div>';return}if(!q("#verified").checked){q("#submitMsg").innerHTML='<div class="notice warning">Marca la casilla de confirmación.</div>';return}sentPayload=p;const btn=q("#submitBtn");btn.disabled=true;btn.textContent="Enviando...";try{const fd=new FormData();fd.append("payload_json",JSON.stringify(p));if(preparedUploads.dpiFront[0])fd.append("dpi_front",preparedUploads.dpiFront[0],preparedUploads.dpiFront[0].name);if(preparedUploads.dpiBack[0])fd.append("dpi_back",preparedUploads.dpiBack[0],preparedUploads.dpiBack[0].name);const r=await fetch("/api/stage1/submit",{method:"POST",body:fd}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||"No se pudo enviar el Paso 1.");requestId=data.result.request_id;currentCaseId=data.result.case_id||currentCaseId;stage1Decision={status:data.result.status||"pending",message:data.result.message||""};downloadStage1Pdf(true).catch(()=>{});q("#stage1PdfBtn").disabled=false;q("#stage1PdfBtn2").disabled=false;q("#stage1PdfBtnForm").disabled=false;q("#stage1PdfHint").textContent="PDF del Paso 1 listo para descargar.";clearDraft(false);q("#decisionCard").classList.remove("hidden");q("#decisionBadge").textContent=sellerStateLabel(data.result.estado||"SUBIDA");q("#decisionBody").innerHTML='<div class="notice success"><strong>Paso 1 enviado al administrador.</strong><br>Solicitud: '+esc(requestId||'N/D')+'<br>Estado: '+esc(sellerStateLabel(data.result.estado||"SUBIDA"))+'</div>';setProgress(3);q("#decisionCard").scrollIntoView({behavior:"smooth"})}catch(err){q("#submitMsg").innerHTML='<div class="notice bad">'+esc(err.message)+'</div>'}finally{btn.disabled=false;btn.textContent="Enviar solicitud del paso 1"}});
q("#stage1PdfBtn").addEventListener("click",()=>downloadStage1Pdf().catch(e=>alert(e.message)));q("#stage1PdfBtn2").addEventListener("click",()=>downloadStage1Pdf().catch(e=>alert(e.message)));q("#stage1PdfBtnForm").addEventListener("click",()=>downloadStage1Pdf().catch(e=>alert(e.message)));q("#finalPdfBtn").addEventListener("click",()=>downloadFinalPdf().catch(e=>alert(e.message)));q("#finalPdfBtnTop").addEventListener("click",()=>downloadFinalPdf().catch(e=>alert(e.message)));
q("#stage2AnalyzeBtn").addEventListener("click",async()=>{const btn=q("#stage2AnalyzeBtn");btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Leyendo documentos...';q("#stage2ExtractMsg").innerHTML="";try{const fd=new FormData();fd.append("selfie",preparedUploads.stage2Selfie[0],preparedUploads.stage2Selfie[0].name);preparedUploads.stage2Utility.forEach(f=>fd.append("utility_files",f,f.name));preparedUploads.stage2Income.forEach(f=>fd.append("income_files",f,f.name));fd.append("stage1_json",JSON.stringify(sentPayload));fd.append("case_id",currentCaseId||"");const r=await fetch("/api/stage2/extract",{method:"POST",body:fd}),raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw new Error("Respuesta no válida: "+raw.slice(0,250))}if(!r.ok||!data.ok)throw new Error(data.error||"No se pudieron analizar los documentos.");stage2Extraction=data.extraction;if(currentRecordState&&data.documents)currentRecordState.stage2_documents=data.documents;q("#stage2FormCard").classList.remove("hidden");applyExtraction(stage2Extraction.fields,q("#stage2Form"));const g=stage2Group();if(g==="activity"){const d=q('[name="digitacion.direccion_empresa"]'),t=q('[name="digitacion.telefono_empresa"]');if(!d.value)d.value=q('[name="domicilio.direccion_completa"]')?.value||"";if(!t.value)t.value=sentPayload?.datos_basicos?.numero_celular||""}const sc=stage2Extraction.selfie_check,dc=stage2Extraction.domicile_consistency,ic=stage2Extraction.income_consistency;const problem=!sc?.persona_visible||!sc?.dpi_visible_junto_al_rostro||sc?.texto_dpi_comparable==="no_coincide"||dc?.status==="possible_conflict"||ic?.status==="possible_conflict";q("#stage2QualityBadge").className="badge "+(problem?"warn":"ok");q("#stage2QualityBadge").textContent=problem?"Revisar":"Documentos revisados";q("#stage2QualityBox").innerHTML='<div class="notice '+(problem?'warning':'success')+'"><strong>Revisión automática</strong><br>Selfie con DPI: '+(sc?.dpi_visible_junto_al_rostro?'Correcta':'Revisar')+' · Domicilio: '+esc(dc?.status||'insufficient')+' · Ingresos: '+esc(ic?.status||'not_applicable')+'</div>';stage2AnalyzedSignature=stage2Signature();q("#stage2ExtractMsg").innerHTML='<div class="notice success"><strong>Documentos leídos.</strong> Revisa y completa únicamente lo que falte. Si cambias un archivo, podrás analizarlos de nuevo.</div>';updateStage2ValidationUI();q("#stage2FormCard").scrollIntoView({behavior:"smooth"})}catch(e){q("#stage2ExtractMsg").innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}finally{btn.textContent="Leer documentos y completar datos";updateButtons()}});
q("#stage2JsonBtn").addEventListener("click",()=>{const final={stage1:sentPayload,stage2:buildStage2Payload()};q("#stage2JsonPreview").textContent=JSON.stringify(final,null,2);q("#stage2JsonPreview").classList.toggle("hidden")});
q("#stage2Form").addEventListener("submit",async e=>{e.preventDefault();const s2=buildStage2Payload(),g=stage2Group(),d=s2.domicilio||{},dig=s2.digitacion||{};if(!d.direccion_completa){q("#finalMsg").innerHTML='<div class="notice bad">Hace falta la dirección completa.</div>';return}if(g==="company"){for(const [k,l] of [["nombre_empresa","nombre de empresa/institución"],["direccion_empresa","dirección"],["telefono_empresa","teléfono"],["antiguedad","antigüedad"]])if(!dig[k]){q("#finalMsg").innerHTML='<div class="notice bad">Hace falta '+l+'.</div>';return}}else{for(const [k,l] of [["giro_oficio","giro/actividad/oficio"],["direccion_empresa","dirección de actividad"],["telefono_empresa","teléfono"],["antiguedad","antigüedad"]])if(!dig[k]){q("#finalMsg").innerHTML='<div class="notice bad">Hace falta '+l+'.</div>';return}}if(s2.digitacion?.telefono_empresa&&!validPhone(s2.digitacion.telefono_empresa)){q("#finalMsg").innerHTML='<div class="notice bad">El teléfono de empresa/actividad debe tener exactamente 8 dígitos.</div>';return}const refErr=validateRefs(s2);if(refErr){q("#finalMsg").innerHTML='<div class="notice bad">'+esc(refErr)+'</div>';return}if(!q("#stage2Verified").checked){q("#finalMsg").innerHTML='<div class="notice warning">Marca la confirmación antes de enviar.</div>';return}const finalPayload={workflow:{initial_validation:{result:"approved_by_admin",request_id:requestId},reviewed_by_user:true,submitted_at:new Date().toISOString()},stage1:sentPayload,stage2:s2};finalPayloadCache=finalPayload;const btn=q("#finalSubmitBtn");btn.disabled=true;btn.textContent="Enviando expediente...";try{const r=await fetch("/api/final/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(finalPayload)}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||"No se pudo enviar el expediente.");q("#finalResultCard").classList.remove("hidden");q("#finalResultCard").open=false;q("#finalResultBody").innerHTML='<div class="notice success"><strong>Expediente completo enviado.</strong><br>El expediente fue enviado al administrador para revisión.</div><pre>'+esc(JSON.stringify(data.result,null,2))+'</pre>';q("#finalPdfBtn").disabled=false;q("#finalPdfBtnTop").disabled=false;q("#finalPdfHint").textContent="Expediente completo listo para descargar.";clearDraft();downloadFinalPdf(true).catch(()=>{})}catch(err){q("#finalMsg").innerHTML='<div class="notice bad">'+esc(err.message)+'</div>'}finally{btn.disabled=false;btn.textContent="Enviar expediente completo"}});
q("#cancelEditStage1")?.addEventListener("click",()=>{if(confirm("¿Cancelar la edición y volver sin guardar los cambios?"))goHome()});q("#cancelEditStage2")?.addEventListener("click",()=>{if(confirm("¿Cancelar la edición y volver sin guardar los cambios?"))goHome()});
q("#resetBtn").addEventListener("click",()=>location.reload());updateButtons();updateStage1ValidationUI();

setupPhoneInputs();setupCoverageInputs();
if(adminMode){checkAdminWorkspace()}else{loadSellerOptions();if(localStorage.getItem(DRAFT_KEY))q("#draftBanner")?.classList.remove("hidden");checkSellerSession()}
</script>
</body>
</html>`;


const ADMIN_HTML = String.raw`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrediZas Admin</title><style>
:root{--blue:#14577a;--yellow:#f3c51d;--line:#dce3ee;--muted:#667085;--bad:#c62828}*{box-sizing:border-box}body{font-family:Inter,system-ui,Arial;margin:0;background:#f5f7fb;color:#172033}.wrap{max-width:1560px;margin:18px auto;padding:0 14px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:15px;margin-bottom:12px}h1{font-size:22px;margin:0 0 14px}input,select,button{font:inherit;padding:8px;border:1px solid #cbd5e1;border-radius:8px;min-width:0}button{background:var(--blue);color:#fff;border:0;font-weight:800;cursor:pointer}.secondary{background:#e9eef5;color:#334155}.yellow{background:var(--yellow);color:#292300}.danger{background:#c62828}.grid{display:grid;grid-template-columns:minmax(180px,2fr) repeat(4,minmax(125px,1fr));gap:7px}.newbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:8px;align-items:end}.hidden{display:none!important}.table{overflow:auto;padding:0}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:auto}th,td{padding:6px 7px;border-bottom:1px solid #e7ecf2;text-align:left;vertical-align:top}th{background:#f8fafc;position:sticky;top:0;z-index:2;white-space:nowrap}td{max-width:220px;overflow-wrap:anywhere}.compact{white-space:nowrap;width:1%}.client{min-width:145px}.control-cell{min-width:285px;max-width:340px}.control-cell select{padding:7px 8px;font-size:11px;max-width:175px}.actions{display:flex;gap:5px;flex-wrap:wrap}.actions button{padding:6px 8px;font-size:10px}.fields{display:flex;gap:10px;flex-wrap:wrap}.fields label{font-size:11px}.pdfs{white-space:nowrap}.pdfs a{margin-right:6px}.msg{font-size:10px;margin-top:4px;color:#475467}.procede{color:#166534;font-weight:700}.closed{color:#991b1b;font-weight:800}.status-pill{display:inline-flex;align-items:center;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:900;line-height:1.1;background:#eef2f6;color:#475467;white-space:nowrap}.status-pill.review{background:#e0f2fe;color:#075985}.status-pill.ok{background:#dcfce7;color:#166534}.status-pill.bad{background:#fee2e2;color:#991b1b}.status-pill.warn{background:#ffedd5;color:#9a3412}.stage-control{border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#fafcff;margin-bottom:7px}.stage-control:last-child{margin-bottom:0}.stage-control-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.stage-control-title{font-size:11px;font-weight:900;color:#334155}.stage-control-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.process-label{font-size:11px;font-weight:900;color:#475569;background:#f1f5f9;border-radius:999px;padding:6px 9px;display:inline-flex}.stage-wait{font-size:10px;color:#64748b;padding:6px 0}@media(max-width:980px){.grid{grid-template-columns:1fr 1fr}.newbar{grid-template-columns:1fr}.table{overflow:auto}table{min-width:900px}}</style></head><body><div class="wrap"><h1>CrediZas · Administración</h1>
<div class="card" id="loginCard"><h3>Ingreso de administrador</h3><div class="actions"><input id="adminUser" placeholder="Usuario"><input id="adminPass" type="password" placeholder="Contraseña"><button id="loginBtn">Ingresar</button><button id="exitLoginBtn" class="secondary">Salir a usuarios</button></div><div id="loginMsg" class="msg"></div></div>
<div id="adminApp" class="hidden">
<div class="card"><div class="newbar"><div><strong>Nueva solicitud desde administración</strong><div class="msg">Selecciona el vendedor al que quedará vinculada.</div><select id="newSeller"><option value="">Seleccionar vendedor</option></select></div><button id="newCaseAdminBtn" class="yellow">Nueva solicitud</button></div></div>
<div class="card"><div class="grid"><input id="fQ" placeholder="Nombre, DPI, NIT o teléfono"><select id="fStatus"><option value="">Todos los estados</option><option>SUBIDA</option><option value="EN REVISION">EN REVISIÓN</option><option value="REQUIERE DATOS">REQUIERE INFORMACIÓN</option><option>REINGRESADO</option><option>APROBADA</option><option>RECHAZADA</option></select><select id="fProcess"><option value="">Todos los procesos</option><option value="PRECALIFICACION">PRECALIFICACIÓN</option><option value="FORMALIZACION DE CREDITO">FORMALIZACIÓN DE CRÉDITO</option></select><select id="fSeller"><option value="">Todos los vendedores</option></select><select id="fSort"><option value="updated_desc">Más recientes</option><option value="date_asc">Más antiguos</option><option value="name_asc">Nombre A-Z</option><option value="nit_asc">NIT</option></select></div><div class="actions" style="margin-top:9px"><button id="searchBtn">Buscar</button><button id="exportBtn" class="yellow">Descargar Excel</button><button id="logoutBtn" class="secondary">Cerrar sesión</button></div><div id="adminActionMsg" class="msg"></div></div>
<div class="card"><details><summary style="cursor:pointer;font-weight:800">Seleccionar columnas visibles</summary><div id="fieldChooser" class="fields" style="margin-top:10px"></div></details></div>
<div class="card table"><table><thead><tr id="headRow"></tr></thead><tbody id="rows"></tbody></table></div></div></div>
<script>
const q=s=>document.querySelector(s);const defs={updated_at:"Fecha",nombre:"Cliente",dpi:"DPI",nit:"NIT",telefono:"Teléfono",vendedor:"Vendedor",producto:"Producto",monto:"Monto",ingreso:"Ingreso",proceso:"Proceso actual",estado_precalificacion:"Precalificación",estado_formalizacion:"Formalización",detalle:"Detalle",procede:"Qué procede"};let dataRows=[];let visible=["updated_at","nombre","dpi","telefono","vendedor","estado_precalificacion","estado_formalizacion"];const deletedIds=new Set();
function esc(v){return String(v??"").replace(/[&<>\"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[s]))}function money(v){return "Q "+Number(v||0).toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2})}function labelState(v){return v==="REQUIERE DATOS"?"REQUIERE INFORMACIÓN":v==="EN REVISION"?"EN REVISIÓN":v}function labelProcess(v){return v==="FORMALIZACION DE CREDITO"?"Formalización":"Precalificación"}
function initFields(){const box=q("#fieldChooser");box.innerHTML=Object.entries(defs).map(([k,l])=>'<label><input type="checkbox" data-field="'+k+'" '+(visible.includes(k)?'checked':'')+'> '+l+'</label>').join("");box.querySelectorAll("input").forEach(x=>x.onchange=()=>{visible=[...box.querySelectorAll("input:checked")].map(i=>i.dataset.field);render()})}
function display(c,k){if(k==="updated_at")return c[k]?new Date(c[k]).toLocaleString("es-GT"):"";if(k==="monto"||k==="ingreso")return money(c[k]);if(k==="proceso")return labelProcess(c[k]);if(k==="estado_precalificacion"||k==="estado_formalizacion")return c[k]?labelState(c[k]):"—";return c[k]??""}
function tdClass(k){return ["updated_at","dpi","nit","telefono","proceso","estado_precalificacion","estado_formalizacion"].includes(k)?"compact":k==="nombre"?"client":""}
function stateClass(v){return v==="APROBADA"?"ok":v==="RECHAZADA"?"bad":v==="REQUIERE DATOS"||v==="REINGRESADO"?"warn":v==="EN REVISION"?"review":""}
function cellHtml(c,k){if(k==="estado_precalificacion"||k==="estado_formalizacion"){const v=c[k]||"";return v?'<span class="status-pill '+stateClass(v)+'">'+esc(labelState(v))+'</span>':'<span class="stage-wait">—</span>'}return esc(display(c,k))}
function statusOptions(value){return ["SUBIDA","EN REVISION","REQUIERE DATOS","REINGRESADO","APROBADA","RECHAZADA"].map(v=>'<option value="'+v+'" '+(value===v?"selected":"")+'>'+esc(labelState(v))+'</option>').join("")}
function render(){q("#headRow").innerHTML=visible.map(k=>'<th>'+esc(defs[k])+'</th>').join("")+'<th>Control de estados</th><th>PDF</th><th>Acciones</th>';q("#rows").innerHTML=dataRows.map(c=>{const p1=c.estado_precalificacion||"SUBIDA",p2=c.estado_formalizacion||"",formalEnabled=p1==="APROBADA"||Boolean(c.tiene_paso2);const p1Detail=c.detalle_precalificacion||"",p2Detail=c.detalle_formalizacion||"";const controls='<td class="control-cell"><div class="stage-control"><div class="stage-control-head"><span class="stage-control-title">Precalificación</span><span class="status-pill '+stateClass(p1)+'">'+esc(labelState(p1))+'</span></div><div class="stage-control-row"><select data-state-p1="'+esc(c.id)+'">'+statusOptions(p1)+'</select><button data-save-stage="PRECALIFICACION" data-save-id="'+esc(c.id)+'">Guardar</button></div>'+(p1Detail?'<div class="msg"><strong>Detalle:</strong> '+esc(p1Detail)+'</div>':'')+'</div>'+(formalEnabled?'<div class="stage-control"><div class="stage-control-head"><span class="stage-control-title">Formalización</span><span class="status-pill '+stateClass(p2||"REQUIERE DATOS")+'">'+esc(labelState(p2||"REQUIERE DATOS"))+'</span></div><div class="stage-control-row"><select data-state-p2="'+esc(c.id)+'">'+statusOptions(p2||"REQUIERE DATOS")+'</select><button data-save-stage="FORMALIZACION DE CREDITO" data-save-id="'+esc(c.id)+'">Guardar</button></div>'+(p2Detail?'<div class="msg"><strong>Detalle:</strong> '+esc(p2Detail)+'</div>':'')+(c.procede?'<div class="procede"><strong>Procede:</strong> '+esc(c.procede)+'</div>':'')+'</div>':'<div class="stage-wait">Formalización se habilita automáticamente al aprobar la Precalificación.</div>')+(c.cerrado?'<div class="closed">Expediente cerrado</div>':'')+'</td>';return '<tr>'+visible.map(k=>'<td class="'+tdClass(k)+'">'+cellHtml(c,k)+'</td>').join("")+controls+'<td class="pdfs">'+(c.pdf_stage1?'<a href="/api/admin/pdf/'+encodeURIComponent(c.id)+'/stage1" target="_blank">P1</a>':'')+(c.pdf_final?'<a href="/api/admin/pdf/'+encodeURIComponent(c.id)+'/final" target="_blank">P2</a>':'')+'</td><td><div class="actions"><button data-edit="'+esc(c.id)+'" class="secondary">Editar</button><button data-delete="'+esc(c.id)+'" class="danger">Eliminar</button></div></td></tr>'}).join("");q("#rows").querySelectorAll("[data-save-stage]").forEach(b=>b.onclick=()=>saveStageState(b.dataset.saveId,b.dataset.saveStage,b));q("#rows").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>location.href="/?admin=1&case_id="+encodeURIComponent(b.dataset.edit));q("#rows").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteCase(b.dataset.delete))}
async function loadSellers(){const r=await fetch("/api/admin/sellers"),d=await r.json();if(!r.ok)return;for(const sel of [q("#fSeller"),q("#newSeller")]){const first=sel.options[0]?.outerHTML||'<option value="">Seleccionar vendedor</option>';sel.innerHTML=first;for(const v of d.sellers||[]){const o=document.createElement("option");o.value=v.id;o.textContent=v.name;sel.appendChild(o)}}}
function queryUrl(path){const u=new URL(path,location.origin);[["q","#fQ"],["status","#fStatus"],["process","#fProcess"],["seller_id","#fSeller"],["sort","#fSort"]].forEach(([k,s])=>{const v=q(s).value;if(v)u.searchParams.set(k,v)});return u}
async function search(){const r=await fetch(queryUrl("/api/admin/cases"),{cache:"no-store"}),d=await r.json();if(r.status===401){q("#loginCard").classList.remove("hidden");q("#adminApp").classList.add("hidden");return}q("#loginCard").classList.add("hidden");q("#adminApp").classList.remove("hidden");dataRows=(d.cases||[]).filter(x=>!deletedIds.has(String(x.id)));render()}
async function saveStageState(id,stage,btn){const c=dataRows.find(x=>x.id===id)||{},row=btn?.closest("tr"),selector=stage==="PRECALIFICACION"?"[data-state-p1]":"[data-state-p2]",stateEl=row?.querySelector(selector);if(!stateEl){alert("No se encontró el control de estado. Recarga la página e intenta nuevamente.");return}const state=stateEl.value;let detail="",procede="";const existingDetail=stage==="PRECALIFICACION"?(c.detalle_precalificacion||""):(c.detalle_formalizacion||"");if(state==="REQUIERE DATOS")detail=prompt("¿Qué información debe corregir o completar el vendedor?",existingDetail)||"";if(state==="RECHAZADA")detail=prompt("¿Por qué no aplica al crédito?",existingDetail)||"";if((state==="REQUIERE DATOS"||state==="RECHAZADA")&&!detail.trim())return;if(stage==="FORMALIZACION DE CREDITO"&&state==="APROBADA"){procede=prompt("¿Qué procede con el cliente?",c.procede||"")||"";if(!procede.trim())return}const original=btn.textContent;btn.disabled=true;btn.textContent="Guardando…";try{const r=await fetch("/api/admin/cases/"+encodeURIComponent(id)+"/control",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({etapa:stage,estado:state,detalle:detail,procede})}),raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{throw new Error("El servidor devolvió una respuesta no válida: "+raw.slice(0,180))}if(!r.ok)throw new Error(d.error||"No se pudo actualizar");const i=dataRows.findIndex(x=>x.id===id);if(i>=0&&d.case)dataRows[i]={...dataRows[i],...d.case};render();const msg=q("#adminActionMsg");if(msg){msg.className="msg notice success";msg.innerHTML=stage==="PRECALIFICACION"&&state==="APROBADA"?"<strong>Precalificación aprobada.</strong> Formalización quedó habilitada automáticamente en REQUIERE INFORMACIÓN.":"<strong>Estado guardado correctamente.</strong>"}setTimeout(()=>search().catch(()=>{}),900)}catch(e){alert(e.message||"No se pudo actualizar");btn.disabled=false;btn.textContent=original}}
async function deleteCase(id){const c=dataRows.find(x=>x.id===id);if(!confirm("¿Eliminar definitivamente el expediente de "+(c?.nombre||"este cliente")+"? También se eliminarán sus PDFs y documentos guardados."))return;const r=await fetch("/api/admin/cases/"+encodeURIComponent(id),{method:"DELETE",cache:"no-store"}),raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok){alert(d.error||"No se pudo eliminar");return}deletedIds.add(String(id));dataRows=dataRows.filter(x=>String(x.id)!==String(id));render();const msg=q("#adminActionMsg");if(msg){msg.className="msg notice success";msg.innerHTML="<strong>Expediente eliminado.</strong> El registro, PDFs y documentos asociados fueron enviados a eliminación."}}
q("#loginBtn").onclick=async()=>{const r=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({user:q("#adminUser").value,password:q("#adminPass").value})}),d=await r.json();q("#loginMsg").textContent=d.ok?"Ingreso correcto":(d.error||"No autorizado");if(d.ok){await loadSellers();search()}};q("#exitLoginBtn").onclick=()=>location.href="/";q("#newCaseAdminBtn").onclick=()=>{const sid=q("#newSeller").value;if(!sid){alert("Selecciona un vendedor.");return}location.href="/?admin=1&seller_id="+encodeURIComponent(sid)};q("#searchBtn").onclick=search;q("#exportBtn").onclick=()=>{const u=queryUrl("/api/admin/export.xls");u.searchParams.set("fields",visible.join(","));location.href=u};q("#logoutBtn").onclick=async()=>{await fetch("/api/admin/logout",{method:"POST"});location.reload()};["#fQ","#fStatus","#fProcess","#fSeller","#fSort"].forEach(s=>q(s).addEventListener("change",search));initFields();search().then(()=>loadSellers());
</script></body></html>`;

// -----------------------------
// WORKER ROUTER
// -----------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/admin") return html(ADMIN_HTML);

    if (request.method === "GET" && url.pathname.startsWith("/api/coverage/")) {
      const seller = await verifySeller(request, env);
      if (!seller && !(await verifyAdmin(request, env))) return json({ok:false,error:"Inicia sesión."},401);
      const data = await getCoverageData(env);
      if (url.pathname === "/api/coverage/departments") {
        return json({ok:true,version:data.version||COVERAGE_SOURCE_VERSION,departments:data.departments||[]});
      }
      if (url.pathname === "/api/coverage/municipalities") {
        return json({ok:true,version:data.version||COVERAGE_SOURCE_VERSION,municipalities:coverageMunicipalities(data,url.searchParams.get("department")||"")});
      }
      if (url.pathname === "/api/coverage/towns") {
        return json({ok:true,version:data.version||COVERAGE_SOURCE_VERSION,towns:coverageTowns(data,url.searchParams.get("department")||"",url.searchParams.get("municipality")||"")});
      }
      if (url.pathname === "/api/coverage/check") {
        const coverage=evaluateCoverage(data,url.searchParams.get("department")||"",url.searchParams.get("municipality")||"",url.searchParams.get("town")||"");
        return json({ok:true,coverage});
      }
      return json({ok:false,error:"Ruta de cobertura no encontrada."},404);
    }

    if (request.method === "GET" && url.pathname === "/api/catalog") {
      try {
        const seller = await verifySeller(request, env);
        if (!seller && !(await verifyAdmin(request, env))) return json({ ok:false, error:"Inicia sesión." }, 401);
        const data = await fetchCatalogFromZasHome(env, {
          q: url.searchParams.get("q") || "",
          category: url.searchParams.get("category") || "",
          type: url.searchParams.get("type") || ""
        });
        return json({ ok:true, data:data.slice(0, 50).map(p=>({producto_id:p.producto_id,sku:p.sku,nombre:p.nombre,descripcion:p.descripcion,categoria:p.categoria,tipo_producto:p.tipo_producto,imagen_principal_url:p.imagen_principal_url,monto_solicitado:requestedAmountFromCatalogPrice(p.precio)})) });
      } catch (e) { return json({ ok:false, error:e?.message || "Error consultando catálogo." }, 502); }
    }

    if (request.method === "GET" && url.pathname === "/api/sellers/public") {
      return json({ ok:true, sellers:await listSellers(env) });
    }

    if (request.method === "POST" && url.pathname === "/api/seller/register") {
      try {
        if (!env.CREDIZAS_KV) return json({ok:false,error:"CREDIZAS_KV no está configurado."},503);
        const body = await request.json();
        const name = normalizeSellerName(body?.name);
        const pin = String(body?.pin || "");
        if (name.length < 3 || name.length > 100) return json({ok:false,error:"Escribe el nombre completo del vendedor."},400);
        if (!/^\d{4}$/.test(pin)) return json({ok:false,error:"El PIN debe tener exactamente 4 números."},400);
        const sellers = await listSellers(env);
        if (sellers.some(x => normalizeSellerName(x.name).toLowerCase() === name.toLowerCase())) return json({ok:false,error:"Ese vendedor ya existe. Selecciónalo para ingresar."},409);
        const seller = { id:crypto.randomUUID(), name, active:true, created_at:new Date().toISOString() };
        seller.pin_hash = await sellerPinHash(env, seller.id, pin);
        await kvPutJson(env, SELLER_PREFIX + seller.id, seller);
        const token = await createSellerToken(env, seller);
        const res = json({ok:true,seller:{id:seller.id,name:seller.name}});
        res.headers.append("set-cookie", `${SELLER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
        return res;
      } catch(e) { return json({ok:false,error:e?.message||"No se pudo crear el vendedor."},400); }
    }

    if (request.method === "POST" && url.pathname === "/api/seller/login") {
      try {
        const body = await request.json();
        const sellerId = String(body?.seller_id || "");
        const pin = String(body?.pin || "");
        if (!sellerId || !/^\d{4}$/.test(pin)) return json({ok:false,error:"Vendedor o PIN inválido."},400);
        const seller = await kvGetJson(env, SELLER_PREFIX + sellerId);
        if (!seller || seller.active === false) return json({ok:false,error:"Vendedor no encontrado."},404);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const failKey = SELLER_FAIL_PREFIX + sellerId + ":" + ip;
        const fails = Number(await env.CREDIZAS_KV?.get(failKey) || 0);
        if (fails >= 5) return json({ok:false,error:"Demasiados intentos. Intenta nuevamente en unos minutos."},429);
        const expected = await sellerPinHash(env, seller.id, pin);
        if (expected !== seller.pin_hash) {
          if (env.CREDIZAS_KV) await env.CREDIZAS_KV.put(failKey, String(fails+1), {expirationTtl:600});
          return json({ok:false,error:"PIN incorrecto."},401);
        }
        if (env.CREDIZAS_KV) await env.CREDIZAS_KV.delete(failKey);
        const token = await createSellerToken(env, seller);
        const res = json({ok:true,seller:{id:seller.id,name:seller.name}});
        res.headers.append("set-cookie", `${SELLER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
        return res;
      } catch(e) { return json({ok:false,error:e?.message||"Error de ingreso."},400); }
    }

    if (request.method === "GET" && url.pathname === "/api/seller/me") {
      const seller = await verifySeller(request, env);
      return seller ? json({ok:true,seller}) : json({ok:false,error:"Sin sesión."},401);
    }

    if (request.method === "POST" && url.pathname === "/api/seller/logout") {
      const res=json({ok:true});res.headers.append("set-cookie",`${SELLER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);return res;
    }

    if (request.method === "GET" && url.pathname === "/api/seller/cases") {
      const seller = await verifySeller(request, env); if(!seller)return json({ok:false,error:"No autorizado."},401);
      const records = await listCaseRecords(env,{q:url.searchParams.get("q")||"",sort:"updated_desc"});
      return json({ok:true,cases:records.filter(r=>sellerOwnsCase(r,seller)).map(r=>caseSummary(r))});
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/seller/cases/")) {
      const seller=await verifySeller(request,env);if(!seller)return json({ok:false,error:"No autorizado."},401);
      const id=decodeURIComponent(url.pathname.split("/").filter(Boolean)[3]||"");const rec=await loadCaseRecord(env,id);
      if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);if(!sellerOwnsCase(rec,seller))return json({ok:false,error:"Este expediente pertenece a otro vendedor."},403);
      syncLegacyCaseControl(rec);
      return json({ok:true,case:rec,permissions:sellerCasePermissions(rec)});
    }

    if (request.method === "GET" && /^\/api\/cases\/[^/]+\/documents\/[^/]+$/.test(url.pathname)) {
      const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"No autorizado."},401);
      const parts=url.pathname.split("/").filter(Boolean),id=decodeURIComponent(parts[2]||""),docId=decodeURIComponent(parts[4]||"");const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);if(!isAdmin&&!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);const meta=findCaseDocument(rec,docId);if(!meta)return json({ok:false,error:"Documento no encontrado."},404);if(!env.CREDIZAS_FILES)return json({ok:false,error:"R2 no configurado."},503);const quota=await reserveR2Usage(env,{class_b:1});if(!quota.ok)return r2QuotaBlockedResponse(quota);const obj=await env.CREDIZAS_FILES.get(meta.key);if(!obj)return json({ok:false,error:"Archivo no encontrado en R2."},404);const headers=new Headers();obj.writeHttpMetadata(headers);headers.set("content-type",meta.type||headers.get("content-type")||"application/octet-stream");headers.set("content-disposition",`inline; filename*=UTF-8''${encodeURIComponent(meta.name||"documento")}`);headers.set("cache-control","private, no-store");return new Response(obj.body,{headers});
    }

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      try {
        const body = await request.json();
        if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return json({ ok:false, error:"Configura ADMIN_USER y ADMIN_PASSWORD." }, 503);
        if (body?.user !== env.ADMIN_USER || body?.password !== env.ADMIN_PASSWORD) return json({ ok:false, error:"Credenciales incorrectas." }, 401);
        const token = await createAdminToken(env, body.user);
        const res = json({ ok:true });
        res.headers.append("set-cookie", `credizas_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
        return res;
      } catch (e) { return json({ ok:false, error:e?.message || "Error de login." }, 400); }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      const res = json({ ok:true });
      res.headers.append("set-cookie", "credizas_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
      return res;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/me") {
      return (await verifyAdmin(request, env)) ? json({ok:true,admin:true}) : json({ok:false,error:"No autorizado."},401);
    }

    if (request.method === "GET" && /^\/api\/admin\/cases\/[^/]+$/.test(url.pathname)) {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const id=decodeURIComponent(url.pathname.split("/").filter(Boolean)[3]||"");const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);
      syncLegacyCaseControl(rec);
      return json({ok:true,case:rec,summary:caseSummary(rec)});
    }

    if (request.method === "DELETE" && /^\/api\/admin\/cases\/[^/]+$/.test(url.pathname)) {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const id=decodeURIComponent(url.pathname.split("/").filter(Boolean)[3]||"");const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);
      if (env.CREDIZAS_FILES) {
        const objects=[];
        for (const kind of ["stage1","final"].filter(k=>rec?.pdfs?.[k])) objects.push({key:`cases/${id}/${kind}.pdf`,size:Number(rec?.pdf_sizes?.[kind]||0)});
        for (const doc of [...stage1DocumentEntries(rec), ...stage2DocumentEntries(rec)]) if(doc?.key) objects.push({key:doc.key,size:Number(doc?.size||0)});
        if(objects.length){const total=objects.reduce((a,x)=>a+Number(x.size||0),0),quota=await reserveR2Usage(env,{class_a:objects.length,storage_delta:-total});if(!quota.ok)return r2QuotaBlockedResponse(quota);for(const obj of objects)await env.CREDIZAS_FILES.delete(obj.key)}
      }
      if(!env.CREDIZAS_KV)return json({ok:false,error:"KV no configurado."},503);
      await env.CREDIZAS_KV.delete(CASE_PREFIX+id);
      return json({ok:true,deleted:id});
    }

    if (request.method === "GET" && url.pathname === "/api/admin/r2-quota") {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      const usage = await getR2QuotaUsage(env);
      return json({ ok:true, quota_enabled:r2QuotaEnabled(env), ...usage });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/sellers") {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      return json({ok:true,sellers:await listSellers(env)});
    }

    if (request.method === "GET" && url.pathname === "/api/admin/cases") {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      const records = await listCaseRecords(env, { q:url.searchParams.get("q")||"", status:url.searchParams.get("status")||"", process:url.searchParams.get("process")||"", sort:url.searchParams.get("sort")||"updated_desc" });
      const sellerId=url.searchParams.get("seller_id")||"";const filtered=sellerId?records.filter(r=>String(r.vendedor_id||"")===sellerId):records;
      return json({ ok:true, cases:filtered.map(caseSummary) });
    }

    if (request.method === "PATCH" && /^\/api\/admin\/cases\/[^/]+\/control$/.test(url.pathname)) {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const parts=url.pathname.split("/").filter(Boolean),id=decodeURIComponent(parts[3]||"");
      const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);
      syncLegacyCaseControl(rec);
      const body=await request.json(),estado=String(body?.estado||""),etapa=String(body?.etapa||derivedCaseProcess(rec));
      let detalle=String(body?.detalle||"").trim(),procede=String(body?.procede||"").trim();
      if(!CASE_STATUSES.includes(estado))return json({ok:false,error:"Estado inválido."},400);
      if(!CASE_PROCESSES.includes(etapa))return json({ok:false,error:"Etapa inválida."},400);
      if(["REQUIERE DATOS","RECHAZADA"].includes(estado)&&!detalle)return json({ok:false,error:"Este estado requiere un detalle."},400);

      if(etapa==="PRECALIFICACION"){
        if(!rec.stage1)return json({ok:false,error:"El expediente no tiene Paso 1."},400);
        const ctl=rec.stage1.control||(rec.stage1.control={proceso:"PRECALIFICACION",estado:stage1State(rec)||"SUBIDA",detalle:null});
        const prevEstado=ctl.estado||stage1State(rec)||"SUBIDA";
        ctl.proceso="PRECALIFICACION";ctl.estado=estado;ctl.detalle=detalle||null;
        if(estado==="APROBADA"){
          const formal=rec.formalizacion_control||(rec.formalizacion_control={proceso:"FORMALIZACION DE CREDITO",estado:"REQUIERE DATOS",detalle:"Completar documentos y datos de Formalización de crédito."});
          if(!formal.estado)formal.estado="REQUIERE DATOS";
          if(!formal.detalle&&formal.estado==="REQUIERE DATOS")formal.detalle="Completar documentos y datos de Formalización de crédito.";
          rec.proceso="FORMALIZACION DE CREDITO";rec.estado=formal.estado||"REQUIERE DATOS";
          rec.ultimo_requerimiento=rec.estado==="REQUIERE DATOS"?(formal.detalle||""):"";
          delete rec.closed_at;
        }else{
          rec.proceso="PRECALIFICACION";rec.estado=estado;
          rec.ultimo_requerimiento=estado==="REQUIERE DATOS"?detalle:"";
          if(estado==="RECHAZADA")rec.closed_at=new Date().toISOString();else delete rec.closed_at;
        }
        addCaseHistory(rec,"ADMIN_CONTROL_PRECALIFICACION","admin",{from_state:prevEstado,to_state:estado,detail:detalle||null});
      }else{
        if(stage1State(rec)!=="APROBADA")return json({ok:false,error:"La Formalización solo puede gestionarse después de aprobar la Precalificación."},400);
        const formal=rec.stage2?.control || rec.formalizacion_control || {proceso:"FORMALIZACION DE CREDITO",estado:"REQUIERE DATOS",detalle:null};
        const prevEstado=formal.estado||"REQUIERE DATOS";
        if(estado==="APROBADA"&&!procede)return json({ok:false,error:"Al aprobar la Formalización indica qué procede con el cliente."},400);
        formal.proceso="FORMALIZACION DE CREDITO";formal.estado=estado;formal.detalle=detalle||null;
        if(estado==="APROBADA")formal.procede=procede;
        rec.formalizacion_control={...formal};
        if(rec.stage2)rec.stage2.control={...formal};
        rec.proceso="FORMALIZACION DE CREDITO";rec.estado=estado;
        rec.ultimo_requerimiento=estado==="REQUIERE DATOS"?detalle:"";
        if(estado==="RECHAZADA")rec.closed_at=new Date().toISOString();else delete rec.closed_at;
        if(estado==="APROBADA")rec.procede_cliente=procede;
        addCaseHistory(rec,"ADMIN_CONTROL_FORMALIZACION","admin",{from_state:prevEstado,to_state:estado,detail:detalle||null,procede:estado==="APROBADA"?procede:null});
      }
      await saveCaseRecord(env,rec);
      return json({ok:true,case:caseSummary(rec)});
    }

    if (request.method === "GET" && url.pathname === "/api/admin/export.xls") {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const records=await listCaseRecords(env,{q:url.searchParams.get("q")||"",status:url.searchParams.get("status")||"",process:url.searchParams.get("process")||"",sort:url.searchParams.get("sort")||"updated_desc"});
      const sellerId=url.searchParams.get("seller_id")||"",filtered=sellerId?records.filter(r=>String(r.vendedor_id||"")===sellerId):records;const requested=(url.searchParams.get("fields")||"").split(",").filter(Boolean);const fields=requested.length?requested:Object.keys(ADMIN_EXPORT_FIELDS);const xml=makeExcelXml(filtered,fields);
      return new Response(xml,{headers:{"content-type":"application/vnd.ms-excel; charset=utf-8","content-disposition":`attachment; filename="CrediZas-${new Date().toISOString().slice(0,10)}.xls"`}});
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/seller/pdf/")) {
      const seller=await verifySeller(request,env);if(!seller)return json({ok:false,error:"No autorizado."},401);if(!env.CREDIZAS_FILES)return json({ok:false,error:"R2 no configurado."},503);const parts=url.pathname.split("/").filter(Boolean),id=decodeURIComponent(parts[3]||""),kind=parts[4]==="final"?"final":"stage1",rec=await loadCaseRecord(env,id);if(!rec||!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);const quota=await reserveR2Usage(env,{class_b:1});if(!quota.ok)return r2QuotaBlockedResponse(quota);const obj=await env.CREDIZAS_FILES.get(`cases/${id}/${kind}.pdf`);if(!obj)return json({ok:false,error:"PDF no encontrado."},404);const name=String(rec?.stage1?.data?.datos_basicos?.nombre_completo||id).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _.-]/g," ").replace(/\s+/g," ").trim();return new Response(obj.body,{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${name}.pdf"`}});
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/admin/pdf/")) {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      if (!env.CREDIZAS_FILES) return json({ ok:false, error:"Configura el binding R2 CREDIZAS_FILES." }, 503);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = decodeURIComponent(parts[3]||"");
      const kind = parts[4] === "final" ? "final" : "stage1";
      const quota = await reserveR2Usage(env, { class_b:1 });
      if (!quota.ok) return r2QuotaBlockedResponse(quota);
      const obj = await env.CREDIZAS_FILES.get(`cases/${id}/${kind}.pdf`);
      if (!obj) return json({ ok:false, error:"PDF no encontrado." }, 404);
      const rec = await loadCaseRecord(env,id); const name = String(rec?.stage1?.data?.datos_basicos?.nombre_completo || id).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _.-]/g," ").replace(/\s+/g," ").trim();
      return new Response(obj.body, { headers:{ "content-type":"application/pdf", "content-disposition":`attachment; filename="${name}.pdf"` } });
    }

    if (request.method === "PUT" && url.pathname.startsWith("/api/cases/") && url.pathname.includes("/pdf/")) {
      const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"No autorizado."},401);
      if (!env.CREDIZAS_FILES) return json({ ok:false, error:"Configura CREDIZAS_FILES para almacenar PDFs." }, 503);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = decodeURIComponent(parts[2]||"");
      const kind = parts[4] === "final" ? "final" : "stage1";
      const pdfBytes = await request.arrayBuffer();
      const rec = await loadCaseRecord(env,id);
      if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);if(!isAdmin&&!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);
      if(!isAdmin&&!["SUBIDA","REINGRESADO"].includes(rec.estado))return json({ok:false,error:"El PDF está bloqueado porque el expediente ya está en revisión administrativa."},403);
      const oldSize = Number(rec?.pdf_sizes?.[kind] || 0);
      const newSize = pdfBytes.byteLength;
      const storageDelta = Math.max(0, newSize - oldSize);
      const quota = await reserveR2Usage(env, { class_a:1, storage_delta:storageDelta });
      if (!quota.ok) return r2QuotaBlockedResponse(quota);
      await env.CREDIZAS_FILES.put(`cases/${id}/${kind}.pdf`, pdfBytes, { httpMetadata:{ contentType:"application/pdf" } });
      if (rec) {
        rec.pdfs = rec.pdfs || {};
        rec.pdf_sizes = rec.pdf_sizes || {};
        rec.pdfs[kind] = true;
        rec.pdf_sizes[kind] = newSize;
        await saveCaseRecord(env,rec);
      }
      return json({ ok:true, stored_bytes:newSize });
    }

    if (request.method === "GET" && url.pathname === "/") return html(APP_HTML);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "credizas-worker-v20-sellers-admin",
        model: env.OPENAI_MODEL || MODEL_DEFAULT,
        openai_key_configured: Boolean(String(env.OPENAI_API_KEY || "").trim()),
        initial_endpoint_configured: Boolean(env.INITIAL_VALIDATION_URL),
        final_endpoint_configured: Boolean(env.FINAL_SYSTEM_URL),
        image_detail: env.IMAGE_DETAIL || "high",
        r2_quota_guard_enabled: r2QuotaEnabled(env),
        r2_quota_guard_storage_bytes: r2QuotaLimits(env).storage_bytes,
        stage1_client_conversion: "jpeg-1800px"
      });
    }

    if (request.method === "POST" && url.pathname === "/api/stage1/extract") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const fd = await request.formData();

        const dpiFront = fd.get("dpi_front");
        const dpiBack = fd.get("dpi_back");

        if (!(dpiFront instanceof File)) {
          return json({ ok: false, error: "Falta DPI anverso." }, 400);
        }

        if (!(dpiBack instanceof File)) {
          return json({ ok: false, error: "Falta DPI reverso." }, 400);
        }

        assertSupportedFiles([dpiFront, dpiBack], {
          imagesOnly: true,
          maxFiles: 2,
          maxEachMB: 8,
          maxTotalMB: 16
        });

        const result = await extractStage1({
          dpiFront,
          dpiBack,
          env
        });

        return json({
          ok: true,
          extraction: result.parsed,
          meta: {
            model: env.OPENAI_MODEL || MODEL_DEFAULT,
            openai_request_id: result.request_id,
            files_received: 2
          }
        });
      } catch (e) {
        console.error("stage1/extract:", e?.message || "unknown");
        return json({
          ok: false,
          error: e?.message || "Error procesando DPI."
        }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/stage1/submit") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const contentType=String(request.headers.get("content-type")||"");
        let payload,dpiFrontFile=null,dpiBackFile=null;
        if(contentType.includes("multipart/form-data")){
          const fd=await request.formData();
          try{payload=JSON.parse(String(fd.get("payload_json")||"{}"))}catch{return json({ok:false,error:"Payload del Paso 1 inválido."},400)}
          const f1=fd.get("dpi_front"),f2=fd.get("dpi_back");
          if(f1 instanceof File)dpiFrontFile=f1;if(f2 instanceof File)dpiBackFile=f2;
        }else{payload=await request.json()}

        const basic = payload?.datos_basicos || {};
        const comp = payload?.informacion_complementaria || {};
        const solicitud = payload?.solicitud || {};

        const requiredBasic = [
          ["nombre_completo", "Nombre completo"],
          ["numero_dpi", "Número de DPI"],
          ["fecha_nacimiento", "Fecha de nacimiento"],
          ["nit", "NIT"],
          ["numero_celular", "Número de celular"],
          ["estado_civil", "Estado civil"],
          ["genero", "Género"]
        ];

        for (const [key, label] of requiredBasic) {
          if (!basic[key]) {
            return json({ ok: false, error: "Falta: " + label + "." }, 400);
          }
        }

        if (!["SOLTERO","CASADO","VIUDO"].includes(String(basic.estado_civil || "").toUpperCase())) {
          return json({ ok:false, error:"Estado civil inválido. Usa SOLTERO, CASADO o VIUDO." }, 400);
        }
        if (!/^\d{8}$/.test(String(basic.numero_celular || ""))) {
          return json({ ok:false, error:"El celular del cliente debe tener exactamente 8 dígitos." }, 400);
        }

        if (
          basic.estado_civil === "CASADO" &&
          !basic.nombre_conyuge
        ) {
          return json({
            ok: false,
            error: "El nombre del cónyuge es obligatorio para estado civil CASADO o UNIDO."
          }, 400);
        }

        if (!solicitud?.producto_solicitado || !solicitud?.producto_sku) {
          return json({ ok:false, error:"Selecciona un producto del catálogo ZasHome." }, 400);
        }
        const catalogProduct = await findCatalogProduct(env, solicitud.producto_id, solicitud.producto_sku);
        if (!catalogProduct) return json({ ok:false, error:"No se pudo validar el producto en el catálogo activo." }, 400);
        const amount = requestedAmountFromCatalogPrice(catalogProduct.precio);
        payload.solicitud.producto_id = catalogProduct.producto_id;
        payload.solicitud.producto_sku = catalogProduct.sku;
        payload.solicitud.producto_solicitado = catalogProduct.nombre;
        payload.solicitud.producto_precio_catalogo = catalogProduct.precio;
        payload.solicitud.producto_imagen_url = catalogProduct.imagen_principal_url;
        payload.solicitud.margen_aplicado = 0.50;
        payload.solicitud.monto_total_solicitado = amount;

        const ingresoPromedio = Number(comp.ingreso_promedio_mensual);
        if (!Number.isFinite(ingresoPromedio) || ingresoPromedio <= 0) {
          return json({ ok: false, error: "Ingreso promedio mensual inválido." }, 400);
        }
        payload.informacion_complementaria.ingreso_promedio_mensual = ingresoPromedio;

        const requiredComp = [
          ["fuente_ingresos", "Fuente de ingresos"],
          ["origen_ingresos", "Origen de ingresos"],
          ["subtipo_ingreso", "Subtipo de ingreso"],
          ["tipo_vivienda", "Tipo de vivienda"],
          ["departamento", "Departamento"],
          ["municipio", "Municipio"],
          ["nivel_educacion", "Nivel de educación"]
        ];

        for (const [key, label] of requiredComp) {
          if (!comp[key]) {
            return json({ ok: false, error: "Falta: " + label + "." }, 400);
          }
        }

        payload.datos_basicos.producto_interes = "CCO ELECTRO";
        payload.informacion_complementaria =
          payload.informacion_complementaria || {};
        payload.informacion_complementaria.tipo_nacionalidad = "GUATEMALA";
        const coverageData = await getCoverageData(env);
        payload.informacion_complementaria.poblado = String(payload.informacion_complementaria.poblado || "").trim();
        payload.informacion_complementaria.cobertura_bda = evaluateCoverage(
          coverageData,
          payload.informacion_complementaria.departamento,
          payload.informacion_complementaria.municipio,
          payload.informacion_complementaria.poblado
        );

        payload.reglas_etapa_2 = payload.reglas_etapa_2 || {};
        payload.reglas_etapa_2.sustento_ingresos = deriveStage2IncomeRule(
          payload.informacion_complementaria.fuente_ingresos,
          payload.informacion_complementaria.origen_ingresos
        );

        const caseId = payload?.expediente?.id || crypto.randomUUID();
        payload.expediente = payload.expediente || {};payload.expediente.id=caseId;
        const existing=await loadCaseRecord(env,caseId);
        let actorSeller=seller;
        if(isAdmin){const sid=String(payload.expediente.vendedor_id||existing?.vendedor_id||"");const sr=sid?await kvGetJson(env,SELLER_PREFIX+sid):null;if(!sr)return json({ok:false,error:"Selecciona un vendedor válido."},400);actorSeller={id:sr.id,name:sr.name}}
        payload.expediente.vendedor=actorSeller.name;payload.expediente.vendedor_id=actorSeller.id;
        if(existing&&!isAdmin&&!sellerOwnsCase(existing,actorSeller))return json({ok:false,error:"Expediente no autorizado."},403);
        if(existing&&existing.estado==="RECHAZADA")return json({ok:false,error:"El expediente está rechazado y cerrado. El administrador debe reabrirlo antes de editar."},403);
        if(existing&&!isAdmin&&(existing.proceso!=="PRECALIFICACION"||existing.estado!=="REQUIERE DATOS"))return json({ok:false,error:"Este expediente está bloqueado. El administrador debe marcar Requiere información para habilitar correcciones."},403);
        const result=await submitInitialValidation(payload,env),isCorrection=Boolean(existing);let estado=isAdmin&&existing?(stage1State(existing)||"SUBIDA"):(isCorrection?"REINGRESADO":"SUBIDA");const proceso="PRECALIFICACION";const control1={proceso,estado,detalle:null};payload.control_etapa1=control1;
        const rec=existing||{id:caseId,created_at:new Date().toISOString()};rec.vendedor=actorSeller.name;rec.vendedor_id=actorSeller.id;rec.stage1={data:payload,control:control1,request_id:result.request_id,decision:{status:result.status,message:result.message||""},submitted_at:new Date().toISOString()};if(dpiFrontFile&&dpiBackFile){assertSupportedFiles([dpiFrontFile,dpiBackFile],{imagesOnly:true,maxFiles:2,maxEachMB:8,maxTotalMB:16});await persistStage1Documents(env,rec,caseId,{front:[dpiFrontFile],back:[dpiBackFile]})}syncLegacyCaseControl(rec);addCaseHistory(rec,isAdmin?(isCorrection?"ADMIN_EDIT_STAGE1":"ADMIN_CREATE_STAGE1"):(isCorrection?"STAGE1_REINGRESADO":"STAGE1_SUBIDA"),isAdmin?"admin":"seller",{seller_id:actorSeller.id,seller:actorSeller.name});await saveCaseRecord(env,rec);
        return json({ok:true,result:{...result,case_id:caseId,estado,persisted:Boolean(env.CREDIZAS_KV)}});
      } catch (e) {
        return json({
          ok: false,
          error: e?.message || "Error en precalificación inicial."
        }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/stage1/simulate") {
      try {
        if(!(await verifyAdmin(request,env)))return json({ok:false,error:"Solo administrador."},401);
        const body = await request.json();
        if (!body?.request_id) return json({ ok: false, error: "Falta request_id." }, 400);
        if (!["positive", "negative"].includes(body.result)) return json({ ok: false, error: "result debe ser positive o negative." }, 400);
        const positive = body.result === "positive";
        if (body.case_id) { const rec = await loadCaseRecord(env, body.case_id); if (rec) { if (rec.stage1) { rec.stage1.control = rec.stage1.control || {proceso:"PRECALIFICACION"}; rec.stage1.control.proceso="PRECALIFICACION"; rec.stage1.control.estado = positive ? "APROBADA" : "RECHAZADA"; rec.stage1.decision = { status: positive ? "VALIDACION_POSITIVA" : "VALIDACION_NEGATIVA", message: positive ? "Aprobada" : "Rechazada" }; } if(positive){rec.formalizacion_control=rec.formalizacion_control||{proceso:"FORMALIZACION DE CREDITO",estado:"REQUIERE DATOS",detalle:"Completar documentos y datos de Formalización de crédito."};delete rec.closed_at}else{rec.closed_at=new Date().toISOString()} syncLegacyCaseControl(rec); await saveCaseRecord(env, rec); } }
        return json({
          ok: true,
          response: {
            simulation: true,
            request_id: body.request_id,
            status: positive ? "VALIDACION_POSITIVA" : "VALIDACION_NEGATIVA",
            can_continue: positive,
            message: positive ? "Precalificación positiva. Cliente habilitado para continuar al proceso 2." : "Precalificación negativa. El flujo se detiene en esta simulación.",
            simulated_at: new Date().toISOString()
          }
        });
      } catch (e) {
        return json({ ok: false, error: e?.message || "Error de simulación." }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/stage2/extract") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const fd = await request.formData();
        const selfieFile = fd.get("selfie");
        const utilityFiles = fd.getAll("utility_files").filter(v => v instanceof File);
        const incomeFiles = fd.getAll("income_files").filter(v => v instanceof File);

        if (!(selfieFile instanceof File)) {
          return json({ ok: false, error: "Falta la selfie del cliente sosteniendo su DPI." }, 400);
        }
        if (!utilityFiles.length) {
          return json({ ok: false, error: "Sube recibo de luz, agua o constancia municipal." }, 400);
        }

        const caseId=String(fd.get("case_id")||"");const rec=await loadCaseRecord(env,caseId);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);syncLegacyCaseControl(rec);if(!isAdmin&&!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);if(rec.estado==="RECHAZADA")return json({ok:false,error:"El expediente está rechazado y cerrado."},403);if(rec.proceso!=="FORMALIZACION DE CREDITO")return json({ok:false,error:"El administrador todavía no ha habilitado la Formalización de crédito."},403);if(!isAdmin&&rec.stage2&&rec.estado!=="REQUIERE DATOS")return json({ok:false,error:"El Paso 2 está bloqueado. El administrador debe marcar Requiere información para corregirlo."},403);
        const stage1Data = rec.stage1?.data || {};

        const source = stage1Data?.informacion_complementaria?.fuente_ingresos;
        const origin = stage1Data?.informacion_complementaria?.origen_ingresos;
        const subtype = stage1Data?.informacion_complementaria?.subtipo_ingreso;
        const policy = getIncomeSupportPolicy(source, origin, subtype);

        if (policy.required && !incomeFiles.length) {
          return json({ ok: false, error: policy.title + ". " + policy.guidance }, 400);
        }

        assertSupportedFiles([selfieFile], { imagesOnly: true, maxFiles: 1, maxEachMB: 8, maxTotalMB: 8 });
        assertSupportedFiles(utilityFiles, { maxFiles: 3, maxEachMB: 12, maxTotalMB: 24 });
        if (incomeFiles.length) {
          assertSupportedFiles(incomeFiles, { maxFiles: 4, maxEachMB: 12, maxTotalMB: 30 });
        }

        await persistStage2Documents(env, rec, caseId, { selfie:[selfieFile], utility:utilityFiles, income:incomeFiles });
        await saveCaseRecord(env, rec);
        const result = await extractStage2({ selfieFile, utilityFiles, incomeFiles, stage1Data, env });
        rec.stage2_draft = { extraction:result.parsed, analyzed_at:new Date().toISOString() };
        await saveCaseRecord(env, rec);
        return json({
          ok: true,
          extraction: result.parsed,
          documents: rec.stage2_documents || null,
          meta: {
            model: env.OPENAI_MODEL || MODEL_DEFAULT,
            openai_request_id: result.request_id,
            income_support_required: policy.required,
            income_support_rule: policy.code
          }
        });
      } catch (e) {
        console.error("stage2/extract:", e?.message || "unknown");
        return json({ ok: false, error: e?.message || "Error procesando documentos del Paso 2." }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/final/submit") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const payload = await request.json();
        if (!payload?.workflow?.reviewed_by_user) return json({ ok: false, error: "Falta confirmación de revisión humana." }, 400);
        const caseId=payload?.stage1?.expediente?.id||payload?.stage2?.expediente?.id;const existing=await loadCaseRecord(env,caseId);if(!existing)return json({ok:false,error:"Expediente no encontrado."},404);syncLegacyCaseControl(existing);if(!isAdmin&&!sellerOwnsCase(existing,seller))return json({ok:false,error:"Expediente no autorizado."},403);if(existing.estado==="RECHAZADA")return json({ok:false,error:"El expediente está rechazado y cerrado."},403);if(existing.proceso!=="FORMALIZACION DE CREDITO")return json({ok:false,error:"El administrador todavía no habilita el Paso 2."},403);if(!isAdmin&&existing.stage2&&existing.estado!=="REQUIERE DATOS")return json({ok:false,error:"El Paso 2 está bloqueado hasta que el administrador solicite información."},403);
        const s2data=payload?.stage2||{},s1data=existing?.stage1?.data||{},dom=s2data.domicilio||{},dig=s2data.digitacion||{};
        if(!dom.direccion_completa)return json({ok:false,error:"Hace falta la dirección completa del domicilio."},400);
        const source=s1data?.informacion_complementaria?.fuente_ingresos||"",origin=s1data?.informacion_complementaria?.origen_ingresos||"";
        const companyGroup=(source==="SALARIO"&&origin==="SALARIO FORMAL")||(source==="RENTAS"&&origin==="JUBILADO");
        const requiredWork=companyGroup?["nombre_empresa","direccion_empresa","telefono_empresa","antiguedad"]:["giro_oficio","direccion_empresa","telefono_empresa","antiguedad"];
        for(const k of requiredWork)if(!String(dig?.[k]??"").trim())return json({ok:false,error:"Falta completar un dato obligatorio de "+(companyGroup?"empresa/institución":"actividad/oficio/remesas")+"."},400);
        const storedDocs=existing.stage2_documents||{},policy=getIncomeSupportPolicy(source,origin,s1data?.informacion_complementaria?.subtipo_ingreso||"");
        if(!(storedDocs.selfie||[]).length)return json({ok:false,error:"Falta la selfie con DPI guardada en el expediente."},400);
        if(!(storedDocs.utility||[]).length)return json({ok:false,error:"Falta el documento de domicilio guardado en el expediente."},400);
        if(policy.required&&!(storedDocs.income||[]).length)return json({ok:false,error:"Falta el sustento de ingresos obligatorio guardado en el expediente."},400);
        const phone = s2data?.digitacion?.telefono_empresa;
        if (phone && !/^\d{8}$/.test(String(phone))) return json({ ok:false, error:"El teléfono de empresa/actividad debe tener exactamente 8 dígitos." }, 400);
        for (const [i, ref] of (payload?.stage2?.referencias || []).entries()) {
          if (!/^\d{8}$/.test(String(ref?.celular || ""))) return json({ ok:false, error:`Referencia ${i+1}: el celular debe tener exactamente 8 dígitos.` }, 400);
        }
        const actorSeller=isAdmin?{id:existing.vendedor_id,name:existing.vendedor}:seller;payload.stage2.expediente={id:caseId,vendedor:actorSeller.name,vendedor_id:actorSeller.id};const isCorrection=Boolean(existing.stage2);let estado=isAdmin&&isCorrection?(formalizationState(existing)||"SUBIDA"):(isCorrection?"REINGRESADO":"SUBIDA"),control2={proceso:"FORMALIZACION DE CREDITO",estado,detalle:null};payload.stage2.control_etapa2=control2;const result=await submitFinal(payload,env);existing.formalizacion_control={...control2};existing.stage2={data:payload.stage2,control:control2,extraction:existing.stage2_draft?.extraction||existing.stage2?.extraction||null,submitted_at:new Date().toISOString()};syncLegacyCaseControl(existing);addCaseHistory(existing,isAdmin?(isCorrection?"ADMIN_EDIT_STAGE2":"ADMIN_CREATE_STAGE2"):(isCorrection?"STAGE2_REINGRESADO":"STAGE2_SUBIDA"),isAdmin?"admin":"seller",{seller_id:actorSeller.id,seller:actorSeller.name});await saveCaseRecord(env,existing);return json({ok:true,result:{...result,case_id:caseId,estado,persisted:Boolean(env.CREDIZAS_KV)}});
      } catch (e) {
        return json({ ok: false, error: e?.message || "Error en envío final." }, 500);
      }
    }

    return json({ ok: false, error: "Not found" }, 404);
  }
};
