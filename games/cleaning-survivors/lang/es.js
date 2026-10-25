// おそうじサバイバー: スペイン語の文言。text は script.js の TEXT と同じキー、ほかは EN_* と同じ形。help は遊び方の HTML
(window.CS_I18N = window.CS_I18N || {}).es = {
  text: {
    pageTitle: "Cleaning Survivors",
    pageDesc: "Un juego de acción al estilo Vampire Survivors: barre oleadas de basura y mugre con un equipo de limpieza que ataca solo. 10 niveles en Normal y Difícil. Limpia todas las habitaciones en menos de 10 minutos.",
    gameTitle: "Cleaning Survivors",
    backToGames: "‹ Juegos",
    pause: "Pausa",
    compress: "Compactar",
    board: "Pantalla de juego",
    language: "Idioma",
    warn: (name) => `¡Alerta! ¡${name} se acerca!`,
    rush: "¡Avalancha de basura!",
    tooTough: "¡Demasiado duro! Limpia alrededor",
    shieldDmg: (n) => `DAÑO ${n} %`,
    shieldNone: "Sin barrera",
    bossDown: (name) => `¡${name} eliminado!`,
    srcLeft: (room, n) => `¡Foco destruido! (${room}: quedan ${n})`,
    srcAll: (room) => `¡Todos los focos de «${room}» destruidos!`,
    dumped: (c) => `¡Basura tirada! +${c} monedas`,
    roomDone: (room, bonus) => `¡${room}, reluciente! ${bonus}`,
    roomTreasure: (room) => `¡${room}, reluciente! ¡Ha aparecido un tesoro!`,
    timeUp: "Se acabó el tiempo…",
    allClean: "¡Todas las habitaciones limpias!",
    dumpLabel: "BASURA",
    hudDone: (room) => `¡${room} lista!`,
    hudRooms: (d, n) => `Habitaciones ${d}/${n} listas`,
    hudSrc: (s, d, n) => `Focos ${s} · Habitaciones ${d}/${n} listas`,
    hudKills: (k) => `Limpiados ${k}`,
    hudHp: (a, b) => `PV ${a}/${b}`,
    hudBoxFull: "¡LLENO!",
    hudBox: (a, b) => `Depósito de polvo ${a}/${b}`,
    completion: "Progreso",
    completionMeta: (c, ct, tr, tt) => `Victorias ${c}/${ct} · Tesoros ${tr}/${tt}`,
    logoSmall: "FREGAR · BARRER · SOBREVIVIR",
    logo: "CLEANING<br>SURVIVORS",
    tagline: "¡Barre oleadas de basura y mugre con tu equipo de limpieza!",
    play: "Jugar",
    cleaners: "Limpiadores",
    tutorial: "Tutorial",
    tutAskTitle: "¿Eres nuevo?",
    tutAskText: "¿Quieres aprender lo básico primero en el <b>tutorial</b>? Limpiarás una casita de tres habitaciones en <b>2–3 minutos</b> con pistas por el camino.",
    tutAskPlay: "Jugar el tutorial",
    tutAskSkip: "Saltar",
    tutAskNote: "Si lo saltas, este mensaje no volverá a aparecer. Puedes jugar el tutorial cuando quieras desde la pantalla de título o la selección de nivel.",
    tutorialMeta: "Una casita de tres habitaciones para aprender lo básico en 2–3 minutos",
    recommended: "Para novatos",
    toStage1: "Ir al nivel 1",
    noteTutorial: "¡Tutorial completado! Ahora, a por el nivel 1, «La casa de la basura: planta baja»",
    noteTutorialRetry: "Vuelve a intentar el tutorial",
    tutMove: "Primero, prueba a caminar. Muévete con <b>WASD / flechas</b> (en el móvil, desliza el dedo por la pantalla). Tu equipo de limpieza funciona <b>solo</b>",
    tutKill: "Acércate a la basura. Tu equipo daña <b>automáticamente</b> la basura cercana. Vigila la <b>barra de PV</b> bajo tu personaje",
    tutDust: "La basura eliminada suelta <b>polvo</b> (rombos). Recógelo para ganar experiencia y <b>subir de nivel</b>",
    tutLevelUp: (a, b) => `¡Subes de nivel! Elige un equipo o una pasiva. Solo puedes llevar ${a} equipos y ${b} pasivas, así que piensa bien la combinación`,
    tutSource: "El círculo rojo punteado es un <b>foco</b>, de donde sale la basura. La barra de encima es su <b>barrera de mugre</b>, que se debilita al limpiar el suelo de alrededor. Friega alrededor y luego destrúyelo",
    tutRoom: "<b>Destruye todos los focos</b> de una habitación y limpia <b>al menos el 90 %</b> del suelo para terminarla. El % de arriba a la derecha indica lo limpia que está",
    tutChest: "¡Habitación terminada! Ganas un <b>cofre</b> y una bonificación de la habitación. Recoge el cofre para abrirlo",
    tutDump: "El polvo recogido llena el <b>cubo</b> (depósito de polvo) de abajo a la izquierda. <b>Lleno, tu daño se reduce a la mitad, no puedes recoger polvo y te mueves más lento</b>. Ponte sobre el <b>contenedor verde</b> que hay en cada habitación para vaciarlo",
    tutDanger: "Cuantas más ★ tiene una habitación, más sucia está y más dura es su basura, así que <b>empieza por las de menos ★</b>. En los niveles de verdad ganas limpiando <b>todas las habitaciones en menos de 10 minutos</b>. ¡Limpia las que quedan!",
    achievements: "Logros",
    achClears: "Victorias por limpiador",
    settings: "Ajustes",
    stageSelect: "Elige un nivel",
    recordOf: (name) => `Récords de ${name}`,
    coins: "Monedas",
    hardNote: "Difícil: PV y daño de la basura y los focos de unas 3 a 7 veces los de Normal (según el nivel), cantidad ×1,2. Monedas ×1,6. Sube primero tus habilidades permanentes hasta la mitad más o menos. El último nivel es 50/50 incluso al 80 %.",
    lockedPrev: "Supera el nivel anterior en Normal con este limpiador para entrar",
    lockedHard: "Supera este nivel en Normal con este limpiador para desbloquear Difícil",
    charSelect: "Elige un limpiador",
    charGo: "Elegir nivel con este limpiador",
    changeChar: "Cambiar de limpiador",
    bestRooms: (r, n) => `Mejor: ${r}/${n} habitaciones`,
    bestClear: (time) => `Mejor tiempo ${time}`,
    roomCount: (n) => `${n} habitaciones`,
    badgeTreasure: "T",
    treasure: "Tesoro",
    skills: "Habilidades",
    zukan: "Guía de basura",
    toTitle: "Título",
    unlockText: (n, stage) => `Se une al encontrar el tesoro del nivel ${n}, «${stage}»`,
    trait: (name, desc) => `Rasgo «${name}»: ${desc}`,
    charStats: (hp, gears) => `PV ${hp} · Equipo inicial: ${gears}`,
    charPower: (s) => `Fuerza ${s}`,
    charFav: (b, n) => `Build favorita: ${b} (daño del equipo favorito +${n} %)`,
    sep: ", ",
    stageTitle: (n, name) => `Nivel ${n}: ${name}`,
    planAlt: "Plano",
    briefDesc: "<b>Limpia todas las habitaciones en menos de 10 minutos</b> para superar el nivel. Destruye todos los <b>focos</b> (puntos rojos) de una habitación y deja su suelo reluciente para terminarla y ganar un cofre y una bonificación. <b>Cuantas más ★ tiene una habitación, más sucia está</b>, con más basura y más dura. Si entras demasiado pronto, te arrollarán, así que empieza por las de menos ★. Los focos son <b>más duros cuanto más sucio está su alrededor</b>, así que friega alrededor primero.",
    srcCount: (n) => `Focos ${n}`,
    treasureFoundLine: (name) => `¡Tesoro «${name}» encontrado!`,
    treasureHint: (cond) => `Tesoro: ${cond}`,
    joined: (name) => `${name} se ha unido`,
    willJoin: "Encontrar este tesoro desbloquea un nuevo limpiador",
    bossNote: (mid, boss) => `El subjefe «${mid}» aparece a las 5:00, y el jefe «${boss}» a las 9:00.`,
    cleared: "Superado",
    pickCleaner: "Elige a tu limpiador",
    deploy: (mode) => `Empezar (${mode})`,
    back: "Volver",
    charsSub: "Las victorias de cada limpiador en cada nivel y modo cuentan para el progreso. Elige un limpiador para ver sus victorias por nivel y modo",
    treasures: (a, b) => `Tesoros (${a}/${b})`,
    roomsCell: (r, n) => `${r}/${n} hab.`,
    clears: (a, b) => `Victorias ${a}/${b}`,
    stage: "Nivel",
    useCleaner: "Usar este limpiador",
    planStart: "INICIO",
    paused: "Pausa",
    pauseSub: (stage, left, d, n) => `${stage} · quedan ${left} · Habitaciones limpias ${d}/${n}`,
    resume: "Continuar",
    retry: "Reiniciar",
    toStages: "Selección de nivel",
    onigiri: "Onigiri",
    onigiriDesc: "Recupera 50 PV",
    savings: "Ahorros secretos",
    savingsDesc: "Monedas +10",
    evoWith: (p) => `Evoluciona con ${p}`,
    evoChest: "¡Abre un cofre para evolucionar!",
    evoNeed: (p) => `Puede evolucionar si tienes ${p}`,
    evoFor: (w) => `Necesario para evolucionar ${w}`,
    pickOne: "Elige un equipo o una pasiva",
    tagGear: "Equipo",
    canUpgrade: (n) => `${n} mejoras disponibles`,
    shopCta: (c, n) => `¡Tienes ${c} monedas! Hay ${n} mejoras de habilidades permanentes disponibles, y duran para todas las partidas futuras`,
    recipeAria: (g, p, e) => `${g} + ${p} evoluciona en ${e}`,
    boxFullBanner: "¡Cubo LLENO! Ve a un contenedor",
    boxFullNag: "¡LLENO! No puedes recoger polvo",
    boxNear: "Casi lleno",
    dangerWord1: "Mugre 1 · Fácil",
    dangerWord2: "Mugre 2 · Normal",
    dangerWord3: "Mugre 3 · Duro",
    dangerWord4: "Mugre 4 · ¡Peligro!",
    dangerWord5: "Mugre 5 · ¡¡Extremo!!",
    tagPassive: "Pasiva",
    inventory: "Lo que llevas",
    emptySlot: "Vacío",
    slots: (g, gm, p, pm) => `Equipo ${g}/${gm} · Pasivas ${p}/${pm}`,
    slotNote: (g, p) => `Solo puedes llevar ${g} equipos y ${p} pasivas, así que tu combinación decide cómo luchas.`,
    reroll: (n) => `Cambiar opciones (quedan ${n})`,
    treasureNew: "¡Tesoro encontrado!",
    owned: " (ya lo tienes)",
    joinedBang: (name) => `¡${name} se une al equipo!`,
    evolved: "¡¡EVOLUCIÓN!!",
    evolvedText: (w, e, d) => `¡${w} ha evolucionado en «${e}»! ${d}`,
    chest: "Cofre",
    coins30: "Monedas +30",
    noteAllRooms: "¡Todas las habitaciones limpias!",
    noteTreasure: (name) => `¡Has encontrado el tesoro «${name}»!`,
    noteStage: (n, name) => `¡El nivel ${n}, «${name}», ya está abierto!`,
    noteHard: "¡El modo Difícil de este nivel ya está abierto!",
    noteAll: "¡Toda la mansión reluce! ¡Enhorabuena!",
    noteFirst: (c, m) => `¡Primera victoria en ${m} con ${c}!`,
    wornOut: "Agotado…",
    resultSub: (stage, mode, c) => `${stage} · ${mode} · ${c}`,
    clearTime: "Tiempo",
    playTime: "Tiempo de juego",
    roomsCleaned: "Habitaciones limpias",
    houseClean: "Limpieza (toda la casa)",
    kills: "Basura eliminada",
    level: "Nivel",
    coinKills: "Monedas (basura)",
    coinClean: "Monedas (limpieza)",
    coinDump: "Monedas (contenedores y cofres)",
    coinRoom: "Monedas (habitaciones y focos)",
    coinBoss: "Monedas (jefes)",
    coinClear: "Monedas (victoria)",
    coinMul: (hard) => `Multiplicador (${hard ? "Difícil, " : ""}habilidades)`,
    total: "Total",
    nextStage: "Siguiente nivel",
    again: "Otra vez",
    shopSub: "Solo vale para este limpiador, desde la próxima partida. Las monedas son comunes",
    skillsOf: (name) => `Habilidades de ${name}`,
    max: "MÁX",
    cost: (c) => `${c} monedas`,
    killed: (n) => `Eliminados ${n}`,
    se: "Efectos de sonido",
    bgm: "Música",
    shake: "Temblor y destellos",
    haze: "Neblina de mugre",
    reviveTitle: "¿Lo intentas otra vez?",
    reviveText: "Levántate ahí mismo con todos los PV.",
    reviveBtn: "Revivir",
    giveUp: "Rendirse",
    revived: "¡De vuelta! ¡Sigue así!",
    rerollPlus: "+2 cambios",
    coinsX: (n) => `Monedas ×1,5 (+${n})`,
    coinAd: "Monedas (bonificación ×1,5)",
    withAd: (s) => `📺 Ver un anuncio: ${s}`,
    adLoading: "Cargando anuncio…",
    adFailed: "No se pudo cargar un anuncio. Espera un momento y vuelve a intentarlo",
    howToPlay: "Cómo jugar",
    perkReroll: "Cambiar opciones",
    perkRerollDesc: "Un cambio de opciones al subir de nivel en cada partida",
    perkRevive: "Revivir",
    perkReviveDesc: "Una vez por partida, levántate con todos los PV cuando estés agotado",
    perkHow: (n, mode) => `Se desbloquea con el tesoro del nivel ${n} (${mode})`,
    perkOn: "Desbloqueada (por un tesoro)",
    perkGot: (name) => `¡Habilidad permanente «${name}» desbloqueada!`,
    perkTeaser: (name) => `Desbloquea la habilidad permanente «${name}»`,
    treasureClue: (stage, mode, cond) => `Pista (${stage}, ${mode}): ${cond}`,
    condRoom: (room) => `Terminar la habitación con más ★, «${room}»`,
    condKills: (n, enemy) => `Eliminar ${n} × ${enemy} en una partida`,
    condRoomTime: (room, time) => `Terminar «${room}» en menos de ${time}`,
    condSrcTime: (time) => `Destruir todos los focos de la casa en menos de ${time}`,
    condClearTime: (time) => `Limpiar todas las habitaciones en menos de ${time}`,
    condBoss: (boss) => `Derrotar a «${boss}»`,
    condDumps: (n) => `Vaciar el cubo ${n} veces en una partida`,
    condHpKeep: (pct) => `Superar el nivel sin que tus PV bajen del ${pct} %`,
    treasureAppeared: "¡Ha aparecido un tesoro!",
    hudTreasure: (s) => `Tesoro ${s}`,
    hudDumpCount: (a, b) => `Vaciados ${a}/${b}`,
    hudTimeLeft: (s) => `quedan ${s}`,
    treasurePerks: "Habilidades que desbloquean los tesoros",
    reviveFree: "Revivir con el poder del tesoro",
  },
  enemies: {
    dust: ["Pelusa", "Débil, pero llega en enjambres enormes. Está en todas las habitaciones."],
    hair: ["Bola de pelo", "Va mezclada con el polvo. Si se te enreda, te frena un poco."],
    paper: ["Bola de papel", "La basura más corriente. Te persigue en línea recta."],
    can: ["Lata vacía", "Rueda hacia ti y te embiste. Duele."],
    bottle: ["Botella de plástico", "Más rápida y dura que una lata. Rebota en las paredes."],
    grease: ["Grasa pegajosa", "Un limo viscoso. Ensucia el suelo y te frena mucho al tocarlo."],
    spore: ["Espora de moho", "Mantiene la distancia y esparce esporas. Respirarlas causa una alergia que resta PV."],
    bag: ["Bolsa de basura", "Revienta al eliminarla y derrama la basura que lleva."],
    pile: ["Montón de basura", "Un foco que genera basura y ensucia el suelo hasta que lo destruyes."],
    drain: ["Desagüe desbordado", "Un foco que escupe grasa pegajosa y pelos."],
    nest: ["Nido de moho", "Un foco de esporas de moho. El spray desinfectante funciona muy bien."],
    boxes: ["Pila de cajas", "Un foco del que salen rodando bolas de papel y latas."],
    yokai: ["Espectro de la basura", "El subjefe que aparece a las 5:00. Esparce basura mientras se acerca."],
    kaiju: ["Monstruo de moho", "El jefe que aparece a las 9:00. Cubre el suelo de moho y dispara esporas."],
    master: ["Señor de la casa de la basura", "El jefe de la sala del señor. Controla toda la casa de la basura."],
  },
  weapons: {
    vacuum: ["Aspiradora turbo", "Apunta una boquilla en cono a la basura cercana y daña todo lo que hay dentro.",
      ["Daño +2", "Alcance de succión +15", "Ángulo de succión +15°", "Daño +3", "Intervalo de succión −0,06 s", "Alcance de succión +20", "Daño +4, ángulo +15°"]],
    washer: ["Hidrolimpiadora", "Dispara un chorro de agua a la basura cercana que la atraviesa y la empuja.",
      ["Chorros +1", "Daño +5", "Ancho del chorro +5", "Chorros +1", "Daño +6", "Alcance +80, intervalo −0,2 s", "Chorros +1, daño +6"]],
    robot: ["Robot limpiador", "Gira a tu alrededor, tritura la basura y abrillanta el suelo.",
      ["Robots +1", "Daño +3", "Radio de órbita +16", "Robots +1", "Giro más rápido, daño +3", "Tamaño del robot +4", "Robots +1"]],
    spray: ["Spray desinfectante", "Deja a tu alrededor una niebla desinfectante que perdura. Daño doble al moho.",
      ["Nieblas +1", "Tamaño de la niebla +8", "Daño +2", "Duración +0,6 s", "Nieblas +1", "Tamaño de la niebla +10", "Daño +3, nieblas +1"]],
    roller: ["Rodillo quitapelusas", "Te sigue y recoge la basura y la mugre de tu camino.",
      ["Daño +3", "Ancho +8", "Daño +3", "Rodillos +1", "Ancho +8", "Daño +4", "Rodillos +1"]],
    mop: ["Fregona", "Barre un arco amplio delante de ti, aparta la basura y friega el suelo a fondo.",
      ["Daño +4", "Alcance +12", "Intervalo −0,12 s", "Daño +5", "Ángulo de barrido +40°", "Alcance +16", "Daño +6, intervalo −0,1 s"]],
    duster: ["Plumero", "Se lanza como un bumerán y barre la basura a la ida y a la vuelta. Atraviesa.",
      ["Daño +3", "Plumeros +1", "Distancia +40", "Tamaño +4, daño +3", "Plumeros +1", "Intervalo −0,25 s", "Daño +5, plumeros +1"]],
    bomb: ["Bomba de detergente", "Lanza detergente a los grupos de basura; la espuma al estallar los limpia todos.",
      ["Daño +6", "Tamaño de la explosión +10", "Bombas +1", "Intervalo −0,3 s", "Daño +8", "Tamaño de la explosión +12", "Bombas +1, daño +6"]],
    purifier: ["Purificador de aire", "Mantiene limpio el aire a tu alrededor, daña poco a poco y repele la basura que se acerca.",
      ["Radio +8", "Daño +2", "Intervalo −0,08 s", "Radio +10", "Daño +3", "Radio +10, intervalo −0,06 s", "Daño +4"]],
    press: ["Prensa de polvo", "Compacta poco a poco el contenido del depósito de polvo para soltar una onda expansiva. Cuanto más polvo, más fuerte, y además libera espacio.",
      ["Tamaño de la onda +20", "Daño +4", "Intervalo −0,6 s", "Cantidad compactada +5 %", "Tamaño de la onda +25", "Daño +6", "Intervalo −0,7 s, cantidad compactada +5 %"]],
    sponge: ["Esponja mágica", "Rebota en las paredes volando por la habitación y quita la basura y la mugre.",
      ["Daño +3", "Esponjas +1", "Tiempo de vuelo +1 s", "Tamaño +4", "Daño +4, más rápida", "Esponjas +1", "Daño +5, tiempo de vuelo +1 s"]],
  },
  evos: {
    blackhole: ["Aspiradora agujero negro", "Coloca delante un vórtice de succión que daña toda la basura que hay dentro."],
    steam: ["Cañón de vapor sobrecalentado", "Un rayo de vapor grueso y largo que deja reluciente toda su línea al instante."],
    army: ["Escuadrón de robots", "Más robots y más grandes giran más rápido a tu alrededor, trituran la basura y abrillantan una zona más amplia."],
    acid: ["Niebla de lluvia ácida", "Hace llover desinfectante por toda la pantalla."],
    giant: ["Apisonadora gigante", "Un rodillo enorme que deja reluciente todo tu camino y aplasta la basura."],
    tornado: ["Fregona tornado", "Barre sin parar a tu alrededor a gran velocidad."],
    gale: ["Plumero del dios del viento", "Varios plumeros grandes salen volando y traen de vuelta el polvo de su camino."],
    foam: ["Explosión de espuma", "Grandes explosiones dejan espuma que disuelve la basura durante un rato."],
    aura: ["Barrera purificadora", "Una barrera enorme que quema la basura y ralentiza todo lo que hay dentro."],
    megapress: ["Megaprensa", "Una onda expansiva que cubre la pantalla y limpia también el suelo de una vez."],
    meteor: ["Lluvia de esponjas", "Muchas esponjas grandes rebotan largo rato y abrillantan toda la habitación."],
  },
  passives: {
    battery: ["Batería extra", "Intervalo de ataque del equipo −8 %"],
    boiler: ["Calentador de agua", "Daño del equipo +10 %"],
    roomba: ["Robot limpiador extra", "Cantidad de equipo +1 (chorros, robots, nieblas, plumeros, bombas, esponjas)"],
    bleach: ["Lejía potente", "Área de ataque +10 %"],
    tape: ["Cinta superadhesiva", "Duración de efectos +10 %"],
    dustpack: ["Bolsa de polvo grande", "Capacidad del depósito +40, alcance de recogida +20 %"],
    boots: ["Botas de agua", "Reduce a la mitad la ralentización en suelo sucio, PV +20"],
    gloves: ["Guantes de goma", "Daño recibido −1"],
    hydraulic: ["Cilindro hidráulico", "Empuje +25 %, capacidad del depósito +15"],
    filter: ["Filtro HEPA", "Regenera 0,25 PV por segundo"],
    wax: ["Cera para suelos", "Velocidad de movimiento +6 %, velocidad de proyectiles +10 %"],
  },
  chars: {
    cleaner: ["Hajime el limpiador", "Experto en abrillantar", "Radio de abrillantado al caminar +40 %", "Un limpiador legendario. Un veterano serio al que no se le escapa ni una mancha."],
    mizuki: ["Mizuki la lavadora", "Fanática de la presión", "Daño +15 %", "Una lavadora impaciente que adora su hidrolimpiadora."],
    runta: ["Runta el robot", "Ruedas todoterreno", "No se frena en suelo sucio", "Un robot limpiador construido con los planos del trastero."],
    koroko: ["Koroko la del rodillo", "Buena recogedora", "Alcance de recogida +40 %, depósito +40", "Una chica amante del orden que heredó el rodillo quitapelusas legendario."],
    kiyoshi: ["Dr. Kiyoshi", "Inmunidad de hierro", "Inmune a las alergias, +50 % de daño al moho", "Un doctor entregado a la investigación del moho. Buscaba su cuaderno perdido."],
    tsugumi: ["Tsugumi la aprendiz", "Aún aprendiz", "Daño −20 %, EXP +10 %", "Una aprendiz recién llegada a la mansión. Eso sí, con la esponja mágica nadie le gana."],
    hayate: ["Hayate el vendaval", "Plumero vendaval", "Intervalo de ataque −10 %", "Un limpiador veloz que lanza plumeros como el viento. Aguanta mal los golpes."],
    reika: ["Señorita Reika", "Niña mimada", "Pocos PV, lenta y daño −15 %, pero monedas +30 %", "Una señorita criada en una mansión. Sin su purificador de aire no da ni un paso."],
    gou: ["Gou el jefe", "Coraje de jefe", "Daño +15 %, daño recibido −2", "Un jefe duro que ha limpiado toda la ciudad con una sola fregona. Nadie en la mansión aguanta más."],
    tome: ["Abuela Tome", "Sabiduría de los años", "Empieza con 2 equipos, EXP +25 %", "La antigua cuidadora de la mansión. Lenta de pies, pero nadie la supera en sabiduría y experiencia."],
  },
  bonus: {
    speed: "Velocidad de movimiento +10 %",
    magnet: "Alcance de recogida +25 %",
    hp: "PV máx. +20",
    regen: "Regenera 0,5 PV/s",
    might: "Daño +10 %",
    cd: "Intervalo de ataque −6 %",
    box: "Capacidad del depósito +40",
    armor: "Daño recibido −1",
    area: "Área de ataque +10 %",
    heal: "Recupera todos los PV",
  },
  shop: {
    hp: ["Salud", "PV máx. +12"],
    might: ["Fuerza", "Daño +8 %"],
    clean: ["Poder de limpieza", "Radio de abrillantado al caminar +12 %, área limpiada por el equipo +6 %"],
    speed: ["Velocidad", "Velocidad de movimiento +4 %"],
    armor: ["Defensa", "Daño recibido −1"],
    regen: ["Regeneración", "Regenera 0,2 PV/s"],
    magnet: ["Alcance de recogida", "Alcance de recogida +10 %"],
    xp: ["Experiencia", "EXP obtenida +8 %"],
    box: ["Depósito de polvo", "Capacidad +20"],
    coin: ["Monedas", "Monedas obtenidas +10 %"],
    choices: ["Opciones", "Opciones al subir de nivel 3 → 4"],
  },
  modes: { normal: "Normal", hard: "Difícil" },
  stages: [
    ["La casa de la basura: planta baja", "Alrededor del salón. Sobre todo polvo, papel y latas.",
      { genkan: "Entrada", rouka: "Pasillo", living: "Salón", washitsu: "Sala de tatamis", dining: "Comedor" },
      ["Álbum familiar", "Un viejo álbum de la familia de la mansión, encontrado bajo la basura."]],
    ["La cocina maldita", "Mucha grasa y basura orgánica. Los desagües escupen grasa y el suelo se ensucia enseguida.",
      { rouka: "Pasillo", dining: "Comedor", kitchen: "Cocina", pantry: "Despensa", laundry: "Lavadero", katte: "Puerta trasera" },
      ["Grifo dorado", "Un grifo reluciente de oro puro. Cierta experta en agua siempre ha querido uno."]],
    ["Los baños mohosos", "Llenos de esporas de moho. El suelo del baño resbala.",
      { rouka: "Pasillo", bath: "Baño", datsui: "Vestuario", toilet: "Aseo", senmen: "Lavabos" },
      ["Jabón de perla", "Un jabón misterioso cuya espuma brilla como perlas."]],
    ["El trastero sellado y la planta alta", "El trastero y el armario están llenos de cajas, y los pasillos son estrechos.",
      { kids: "Cuarto infantil", study: "Estudio", hall: "Rellano", storage: "Trastero", nando: "Armario" },
      ["Planos del robot", "Los planos de un robot limpiador, escondidos al fondo del trastero."]],
    ["El jardín abandonado", "Un jardín dividido por setos. El estanque está lleno de moho.",
      { gate: "Verja", path: "Sendero", front: "Jardín delantero", flower: "Parterre", yard: "Tendedero", shed: "Cobertizo", pond: "Orilla del estanque" },
      ["Trébol de cuatro hojas", "Un trébol de la suerte, el único que crece junto al estanque."]],
    ["El desván polvoriento", "Un desván donde se arremolinan polvo y pelos. Cajas por todas partes.",
      { stairs: "Escalera del desván", passage: "Pasadizo", oldclothes: "Cuarto de ropa vieja", chests: "Rincón de baúles", skylight: "Cuarto del tragaluz", nook: "Recoveco", secret: "Cuarto secreto" },
      ["Rodillo legendario", "Un rodillo quitapelusas legendario que dicen que recoge cualquier basura."]],
    ["La sala de calderas del sótano", "Un sótano invadido por grasa y moho. La sala de calderas está llena de desagües.",
      { under: "Bajo la escalera", corridor: "Pasillo del sótano", cellar: "Bodega", washroom: "Zona de lavado", boiler: "Sala de calderas", store: "Almacén" },
      ["Viejo reloj de bolsillo", "Un reloj encontrado detrás de la caldera. Todavía funciona."]],
    ["El garaje de trastos", "Un garaje sembrado de latas y botellas. El cobertizo del fondo es una montaña de cajas.",
      { side: "Puerta lateral", bench: "Banco de trabajo", garage: "Garaje", tools: "Rincón de herramientas", tires: "Montón de neumáticos", back: "Cobertizo del fondo" },
      ["Cuaderno del Dr. Desinfectante", "Las notas de un doctor que luchó contra el moho durante años. Su dueño lo está buscando."]],
    ["El salón de banquetes encantado", "El gran salón después de la fiesta. Montañas de basura y grasa.",
      { lobby: "Vestíbulo", cloak: "Guardarropa", pantry: "Office", hall: "Salón de banquetes", stage: "Escenario", green: "Camerino" },
      ["Candelabro de plata", "Un candelabro olvidado en el escenario. El favorito de los fantasmas."]],
    ["La sala del señor", "El último nivel, donde aparece toda la basura. El jefe es el Señor de la casa de la basura.",
      { shoko: "Biblioteca", bedroom: "Dormitorio", closet: "Vestidor", hall: "Gran salón", master: "Cámara del señor" },
      ["Llave de la mansión", "Una vieja llave que abre todas las puertas de la mansión. Era de la antigua cuidadora."]],
  ],
  hardTreasures: [
    ["Gato de la suerte", "Un maneki-neko dorado enterrado sobre el zapatero de la entrada."],
    ["Cucharón de plata", "El pesado cucharón de plata que adoraba el cocinero de la mansión."],
    ["Dado de la suerte", "Un dado del fondo de la bañera; dicen que permite volver a tirar el destino."],
    ["Muñeca mecánica", "Una muñeca antigua que barre el suelo con una escobita al darle cuerda."],
    ["Regadera dorada", "Una regadera dorada y reluciente enterrada en el parterre."],
    ["Plumero del fénix", "Un plumero escondido en lo más hondo del desván que, dicen, renace una y otra vez."],
    ["Engranaje de latón", "Un gran engranaje reluciente que se soltó del corazón de la caldera."],
    ["Radio retro", "Una radio antigua sacada del montón de trastos. Todavía suena."],
    ["Invitación fantasma", "Una vieja invitación con los nombres de los fantasmas invitados al banquete."],
    ["Recogedor dorado", "Un recogedor de oro puro que el Señor de la casa nunca soltó."],
  ],
  tutorial: ["Tutorial", "Una casita de tres habitaciones para aprender a jugar.", { genkan: "Entrada", living: "Salón", washitsu: "Sala de tatamis" }],
  help: `
    <h2>Cómo se juega</h2>
    <p>Saca la basura de una casa abarrotada con tu equipo de limpieza y <b>deja todas las habitaciones relucientes en menos de 10 minutos</b>. Solo controlas el movimiento: el equipo de limpieza funciona solo. La basura eliminada suelta polvo, que recoges como experiencia. Al subir de nivel, elige un equipo nuevo o una pasiva para hacerte más fuerte. Pierdes si se acaba el tiempo o tus PV llegan a cero.</p>

    <h3>Tutorial</h3>
    <p>Si eres nuevo, empieza por «Tutorial» en la pantalla de título (también se te ofrece la primera vez que pulsas «Jugar»). Limpias una casita de tres habitaciones en 2–3 minutos mientras las pistas de la parte inferior y una flecha verde te enseñan a moverte, subir de nivel, los focos, terminar habitaciones, los cofres y los contenedores. El tutorial no cuenta para el progreso.</p>

    <h3>Planos y focos</h3>
    <p>Hay 10 niveles. Cada nivel es una casa de 5–7 habitaciones separadas por paredes y puertas. Las habitaciones tienen «focos» rodeados por un círculo rojo punteado (montones de basura, desagües, nidos de moho, pilas de cajas), de donde sale la mayor parte de la basura. Los focos ensucian el suelo a su alrededor hasta que los destruyes. Además, están envueltos en una «barrera de mugre» (una película marrón) que los hace más duros cuanto más sucio está el suelo de alrededor. Encima de cada foco verás la fuerza de la barrera (una barra de 5 niveles) y qué parte de tu daño pasa ahora (p. ej. «DAÑO 12 %»). Cuanto más roja la barra, más duro el foco. Limpiar alrededor baja la barra y hace que tus ataques funcionen, así que friega alrededor primero. Cuantos más focos destruyes, menos basura aparece. El minimapa de arriba a la izquierda muestra lo sucia que está cada habitación y dónde están los focos (en rojo).</p>

    <h3>Nivel de mugre de las habitaciones (★)</h3>
    <p>Cada habitación tiene un nivel de mugre de ★1 a ★5. Cuantas más ★, más sucia está, con focos más numerosos y duros y muchísima más basura y más fuerte (la grasa y el moho aparecen desde ★3 y las bolsas de basura desde ★4). La basura de una habitación deambula por ella hasta que entras o te acercas. Si entras en una habitación ★5 con poco nivel, te arrollarán enseguida, así que empieza por las de menos ★ y hazte fuerte. La basura de las habitaciones con muchas ★ suelta polvo grande más a menudo.</p>

    <h3>Terminar una habitación</h3>
    <p>Destruye todos los focos de una habitación y limpia al menos el 90 % de su suelo para terminarla (el resto se abrillanta solo). Ganas un cofre y una bonificación propia de la habitación (más velocidad, más PV máximos, etc.), y la habitación no vuelve a ensuciarse.</p>

    <h3>Normal y Difícil</h3>
    <p>Cada nivel tiene modo Normal y modo Difícil. Superar un nivel en Normal desbloquea el siguiente nivel y el modo Difícil de ese nivel. Los niveles se desbloquean por separado para cada limpiador, así que otro limpiador empieza desde el nivel 1. En Difícil hay más basura y mucho más dura, y es casi imposible ganar hasta tener las habilidades permanentes a la mitad más o menos (el último nivel en Difícil es 50/50 incluso al 80 %). Gasta monedas en «habilidades permanentes» antes de intentarlo (Difícil da 1,6 veces más monedas).</p>

    <h3>Habilidades permanentes</h3>
    <p>Gasta las monedas que ganes para subir salud, fuerza, poder de limpieza (lo ancho que abrillantas el suelo), velocidad, defensa, regeneración, alcance de recogida, experiencia, tamaño del depósito de polvo, monedas y número de opciones al subir de nivel. Son de cada limpiador y solo valen para el que las mejoró, desde la siguiente partida (las monedas son comunes; cambia de limpiador con los iconos de arriba). Ábrelas con el botón «⬆ Habilidades» de la pantalla de título o de la selección de nivel. Cuando puedes pagar una mejora, el botón brilla en dorado y muestra cuántas.</p>

    <h3>Botones de recompensa (revivir, cambios, monedas ×1,5)</h3>
    <p>Cuando estás agotado, puedes levantarte ahí mismo una vez por partida (con todos los PV, y la basura cercana sale volando). Si no te gustan las opciones al subir de nivel, puedes conseguir 2 cambios. Al superar un nivel, puedes multiplicar por 1,5 las monedas ganadas. Cada recompensa se consigue viendo un anuncio y solo está disponible si juegas en CrazyGames.</p>

    <h3>Limpiadores y tesoros</h3>
    <p>Hay 10 limpiadores, cada uno con su equipo inicial y su rasgo. El equipo inicial es el equipo favorito del limpiador y hace +25 % de daño (su build favorita aparece en su ficha). La fuerza va de ★1 a ★5; los limpiadores ★1 tienen pocos PV o poco daño y son un reto. Cada nivel esconde un tesoro en Normal y otro en Difícil, 20 en total. Cada tesoro tiene su propia condición (terminar la habitación con más ★, eliminar cierta cantidad de un tipo de basura, limpiar una habitación en un tiempo límite, derrotar a un jefe, etc.), que aparece en la pantalla previa y en la lista de tesoros. Durante la partida, tu progreso se ve arriba a la derecha y el tesoro aparece cerca de ti al cumplir la condición (las condiciones que se cumplen al superar el nivel se recompensan al terminarlo). Los tesoros se guardan en cuanto los recoges. Algunos tesoros de Normal hacen que se una un nuevo limpiador, y dos tesoros de Difícil desbloquean las habilidades permanentes Cambiar opciones y Revivir. En la pantalla «Logros» (desde el título) puedes ver las victorias de cada limpiador y los tesoros reunidos, con pistas para los que faltan.</p>

    <h3>Progreso</h3>
    <p>El progreso es tu puntuación sobre 300: una victoria en cada nivel y cada modo con cada limpiador (10 limpiadores × 10 niveles × 2 modos = 200 puntos) más los tesoros (20 × 5 puntos = 100 puntos). Supera todos los niveles en todos los modos con todos los limpiadores y reúne todos los tesoros para llegar al 100 %.</p>

    <h3>Suelos sucios</h3>
    <p>El suelo está sucio, y cuanto más sucio, más despacio caminas. Por donde pasa tu equipo de limpieza, el suelo queda limpio. Sobre un suelo reluciente caminas más rápido y recoges el polvo desde más lejos. La mugre se extiende poco a poco, y la basura ensucia por donde pasa. Mientras todo está muy sucio, una neblina marrón cubre la pantalla; se despeja a medida que limpias tu alrededor y toda la casa (se puede desactivar en Ajustes).</p>

    <h3>Depósito de polvo y contenedores</h3>
    <p>El polvo recogido va al cubo (depósito de polvo) de abajo a la izquierda. <b>Cuando está lleno, el daño de tu equipo se reduce a la mitad, no puedes recoger polvo (no ganas experiencia) y te mueves más lento.</b> El cubo se vuelve naranja al 80 % y parpadea en rojo cuando está lleno, y una flecha señala el contenedor más cercano. Ponte sobre el <b>contenedor verde que hay en cada habitación</b> para vaciarlo (ganas monedas). Tus PV se ven en la barra bajo tu personaje.</p>

    <h3>Builds (huecos de equipo y pasivas)</h3>
    <p>Hay 11 tipos de equipo de limpieza, pero en una partida solo puedes llevar <b>4 equipos y 4 pasivas</b>. La fregona barre a tu alrededor, el plumero va y vuelve, la bomba de detergente se lanza a los grupos de basura, la esponja mágica rebota en las paredes, el purificador de aire mantiene alejada la basura cercana, la prensa de polvo compacta el depósito en una onda expansiva, etc.: tu combinación cambia tu forma de luchar. Lo mejor es elegir un equipo junto con la pasiva que lo hace evolucionar. Las pantallas de subida de nivel y de cofre muestran lo que llevas (equipo en azul, pasivas en morado) y las recetas de evolución (equipo + pasiva → icono evolucionado). Al entrar en una habitación, su nivel de mugre (★) aparece en la parte superior de la pantalla.</p>

    <h3>Evolución</h3>
    <p>Sube un equipo de limpieza al nivel 8 y abre un cofre teniendo su pasiva correspondiente para que evolucione. Los cofres los sueltan la basura con borde dorado, los subjefes y los jefes.</p>
    <table>
      <tbody>
        <tr><th>Aspiradora turbo + Batería extra</th><td>Aspiradora agujero negro</td></tr>
        <tr><th>Hidrolimpiadora + Calentador de agua</th><td>Cañón de vapor sobrecalentado</td></tr>
        <tr><th>Robot limpiador + Robot limpiador extra</th><td>Escuadrón de robots</td></tr>
        <tr><th>Spray desinfectante + Lejía potente</th><td>Niebla de lluvia ácida</td></tr>
        <tr><th>Rodillo quitapelusas + Cinta superadhesiva</th><td>Apisonadora gigante</td></tr>
        <tr><th>Fregona + Guantes de goma</th><td>Fregona tornado</td></tr>
        <tr><th>Plumero + Botas de agua</th><td>Plumero del dios del viento</td></tr>
        <tr><th>Bomba de detergente + Bolsa de polvo grande</th><td>Explosión de espuma</td></tr>
        <tr><th>Esponja mágica + Cera para suelos</th><td>Lluvia de esponjas</td></tr>
        <tr><th>Purificador de aire + Filtro HEPA</th><td>Barrera purificadora</td></tr>
        <tr><th>Prensa de polvo + Cilindro hidráulico</th><td>Megaprensa</td></tr>
      </tbody>
    </table>

    <h3>Controles en el móvil</h3>
    <table>
      <tbody>
        <tr><th>Tocar la pantalla y arrastrar</th><td>Moverse (donde tocas primero es el centro del joystick)</td></tr>
        <tr><th>Ⅱ arriba a la derecha</th><td>Pausa</td></tr>
      </tbody>
    </table>

    <h3>Controles en el PC</h3>
    <table>
      <tbody>
        <tr><th>WASD / Flechas</th><td>Moverse</td></tr>
        <tr><th>P / Esc</th><td>Pausa (en los menús, Esc vuelve atrás como el botón «‹ Volver» de arriba a la izquierda)</td></tr>
        <tr><th>1–4</th><td>Elegir una opción al subir de nivel</td></tr>
      </tbody>
    </table>
`,
};
