// おそうじサバイバー: イタリア語の文言。text は script.js の TEXT と同じキー、ほかは EN_* と同じ形。help は遊び方の HTML
(window.CS_I18N = window.CS_I18N || {}).it = {
  text: {
    pageTitle: "Cleaning Survivors",
    pageDesc: "Un gioco d'azione in stile Vampire Survivors: spazza via ondate di rifiuti e sporco con attrezzi per le pulizie che attaccano da soli. 10 livelli in Normale e Difficile. Pulisci tutte le stanze entro 10 minuti.",
    gameTitle: "Cleaning Survivors",
    backToGames: "‹ Giochi",
    pause: "Pausa",
    compress: "Compatta",
    board: "Schermata di gioco",
    language: "Lingua",
    warn: (name) => `Allarme! ${name} si avvicina!`,
    rush: "Ondata di rifiuti!",
    tooTough: "Troppo duro! Pulisci intorno",
    shieldDmg: (n) => `DANNO ${n}%`,
    shieldNone: "Nessuna barriera",
    bossDown: (name) => `${name} eliminato!`,
    srcLeft: (room, n) => `Sorgente distrutta! (${room}: ne restano ${n})`,
    srcAll: (room) => `Tutte le sorgenti di «${room}» distrutte!`,
    dumped: (c) => `Rifiuti svuotati! +${c} monete`,
    roomDone: (room, bonus) => `${room} splendente! ${bonus}`,
    roomTreasure: (room) => `${room} splendente! È apparso un tesoro!`,
    timeUp: "Tempo scaduto…",
    allClean: "Tutte le stanze pulite!",
    dumpLabel: "RIFIUTI",
    hudDone: (room) => `${room} completata!`,
    hudRooms: (d, n) => `Stanze ${d}/${n} completate`,
    hudSrc: (s, d, n) => `Sorgenti ${s} · Stanze ${d}/${n} completate`,
    hudKills: (k) => `Eliminati ${k}`,
    hudHp: (a, b) => `PS ${a}/${b}`,
    hudBoxFull: "PIENO!",
    hudBox: (a, b) => `Contenitore polvere ${a}/${b}`,
    completion: "Completamento",
    completionMeta: (c, ct, tr, tt) => `Vittorie ${c}/${ct} · Tesori ${tr}/${tt}`,
    logoSmall: "STROFINA · SPAZZA · SOPRAVVIVI",
    logo: "CLEANING<br>SURVIVORS",
    tagline: "Spazza via ondate di rifiuti e sporco con i tuoi attrezzi per le pulizie!",
    play: "Gioca",
    cleaners: "Addetti",
    tutorial: "Tutorial",
    tutAskTitle: "Sei nuovo?",
    tutAskText: "Vuoi imparare le basi nel <b>tutorial</b>? Pulirai una casetta di tre stanze in <b>2–3 minuti</b>, con suggerimenti lungo la strada.",
    tutAskPlay: "Gioca il tutorial",
    tutAskSkip: "Salta",
    tutAskNote: "Se salti, questo messaggio non comparirà più. Puoi giocare il tutorial quando vuoi dalla schermata del titolo o dalla scelta del livello.",
    tutorialMeta: "Una casetta di tre stanze per imparare le basi in 2–3 minuti",
    recommended: "Per i principianti",
    toStage1: "Vai al livello 1",
    noteTutorial: "Tutorial completato! Ora affronta il livello 1, «La casa dei rifiuti: piano terra»",
    noteTutorialRetry: "Riprova il tutorial",
    tutMove: "Per prima cosa, prova a camminare. Muoviti con <b>WASD / frecce</b> (sul telefono, trascina il dito sullo schermo). I tuoi attrezzi lavorano <b>da soli</b>",
    tutKill: "Avvicinati ai rifiuti. I tuoi attrezzi danneggiano <b>automaticamente</b> i rifiuti vicini. Tieni d'occhio la <b>barra dei PS</b> sotto il personaggio",
    tutDust: "I rifiuti eliminati lasciano <b>polvere</b> (rombi). Raccoglila per ottenere esperienza e <b>salire di livello</b>",
    tutLevelUp: (a, b) => `Livello su! Scegli un attrezzo o un passivo. Puoi portare solo ${a} attrezzi e ${b} passivi, quindi pensa alla combinazione`,
    tutSource: "Il cerchio rosso tratteggiato è una <b>sorgente</b>, da cui escono i rifiuti. La barra sopra è la sua <b>barriera di sporco</b>, che si indebolisce man mano che pulisci il pavimento intorno. Strofina intorno, poi distruggila",
    tutRoom: "<b>Distruggi tutte le sorgenti</b> di una stanza e pulisci <b>almeno il 90%</b> del pavimento per completarla. La % in alto a destra indica quanto è pulita la stanza",
    tutChest: "Stanza completata! Ricevi un <b>forziere</b> e un bonus della stanza. Raccogli il forziere per aprirlo",
    tutDump: "La polvere raccolta riempie il <b>bidone</b> (contenitore polvere) in basso a sinistra. <b>Quando è pieno, il danno si dimezza, non puoi raccogliere polvere e ti muovi più lentamente</b>. Mettiti sul <b>cassonetto verde</b> presente in ogni stanza per svuotarlo",
    tutDanger: "Più ★ ha una stanza, più è sporca e più duri sono i suoi rifiuti, quindi <b>comincia da quelle con meno ★</b>. Nei livelli veri vinci pulendo <b>tutte le stanze entro 10 minuti</b>. Pulisci le stanze rimaste!",
    achievements: "Obiettivi",
    achClears: "Vittorie per addetto (extra)",
    settings: "Impostazioni",
    stageSelect: "Scegli un livello",
    recordOf: (name) => `Record di ${name}`,
    coins: "Monete",
    hardNote: "Difficile: PS e danno di rifiuti e sorgenti circa 3–7 volte quelli di Normale (dipende dal livello), quantità ×1,2. Monete ×1,6. Porta prima le abilità permanenti a circa metà. L'ultimo livello resta 50/50 anche all'80%.",
    lockedPrev: "Completa il livello precedente in Normale per entrare",
    lockedHard: "Completa questo livello in Normale per sbloccare Difficile",
    bestRooms: (r, n) => `Migliore: ${r}/${n} stanze`,
    bestClear: (time) => `Tempo migliore ${time}`,
    roomCount: (n) => `${n} stanze`,
    badgeTreasure: "T",
    treasure: "Tesoro",
    skills: "Abilità",
    zukan: "Guida ai rifiuti",
    toTitle: "Titolo",
    unlockText: (n, stage) => `Si unisce quando trovi il tesoro del livello ${n}, «${stage}»`,
    trait: (name, desc) => `Talento «${name}»: ${desc}`,
    charStats: (hp, gears) => `PS ${hp} · Attrezzi iniziali: ${gears}`,
    sep: ", ",
    stageTitle: (n, name) => `Livello ${n}: ${name}`,
    planAlt: "Pianta",
    briefDesc: "<b>Pulisci tutte le stanze entro 10 minuti</b> per completare il livello. Distruggi tutte le <b>sorgenti</b> (punti rossi) di una stanza e fai brillare il pavimento per completarla e ottenere un forziere e un bonus. <b>Più ★ ha una stanza, più è sporca</b>, con rifiuti più numerosi e duri. Se entri troppo presto verrai sopraffatto, quindi comincia dalle stanze con meno ★. Le sorgenti sono <b>tanto più dure quanto più è sporco intorno</b>, quindi strofina intorno prima.",
    srcCount: (n) => `Sorgenti ${n}`,
    treasureFoundLine: (name) => `Tesoro «${name}» trovato!`,
    treasureHint: (st, room) => `Tesoro: completa la stanza ${st} «${room}» per trovarlo`,
    joined: (name) => `${name} si è unito`,
    willJoin: "Trovare questo tesoro sblocca un nuovo addetto",
    bossNote: (mid, boss) => `Il mini-boss «${mid}» appare a 5:00, e il boss «${boss}» a 9:00.`,
    cleared: "Completato",
    pickCleaner: "Scegli il tuo addetto",
    deploy: (mode) => `Inizia (${mode})`,
    back: "Indietro",
    charsSub: "Record extra per i completisti; non contano per il completamento. Scegli un addetto per vedere le sue vittorie per livello e modalità",
    treasures: (a, b) => `Tesori (${a}/${b})`,
    roomsCell: (r, n) => `${r}/${n} stanze`,
    clears: (a, b) => `Vittorie ${a}/${b}`,
    stage: "Livello",
    useCleaner: "Usa questo addetto",
    planStart: "INIZIO",
    paused: "Pausa",
    pauseSub: (stage, left, d, n) => `${stage} · restano ${left} · Stanze pulite ${d}/${n}`,
    resume: "Riprendi",
    retry: "Ricomincia",
    toStages: "Scelta del livello",
    onigiri: "Onigiri",
    onigiriDesc: "Ripristina 50 PS",
    savings: "Risparmi segreti",
    savingsDesc: "Monete +10",
    evoWith: (p) => `Si evolve con ${p}`,
    evoChest: "Apri un forziere per evolvere!",
    evoNeed: (p) => `Può evolvere se hai ${p}`,
    evoFor: (w) => `Necessario per evolvere ${w}`,
    pickOne: "Scegli un attrezzo o un passivo",
    tagGear: "Attrezzo",
    canUpgrade: (n) => `${n} potenziamenti disponibili`,
    shopCta: (c, n) => `Hai ${c} monete! Sono disponibili ${n} potenziamenti delle abilità permanenti, validi per tutte le partite future`,
    recipeAria: (g, p, e) => `${g} + ${p} si evolve in ${e}`,
    boxFullBanner: "Bidone PIENO! Vai a un cassonetto",
    boxFullNag: "PIENO! Non puoi raccogliere polvere",
    boxNear: "Quasi pieno",
    dangerWord1: "Sporco 1 · Facile",
    dangerWord2: "Sporco 2 · Normale",
    dangerWord3: "Sporco 3 · Duro",
    dangerWord4: "Sporco 4 · Pericolo!",
    dangerWord5: "Sporco 5 · Estremo!!",
    tagPassive: "Passivo",
    inventory: "Il tuo inventario",
    emptySlot: "Vuoto",
    slots: (g, gm, p, pm) => `Attrezzi ${g}/${gm} · Passivi ${p}/${pm}`,
    slotNote: (g, p) => `Puoi portare solo ${g} attrezzi e ${p} passivi, quindi la tua combinazione decide come combatti.`,
    reroll: (n) => `Cambia scelte (restano ${n})`,
    treasureNew: "Tesoro trovato!",
    owned: " (già posseduto)",
    joinedBang: (name) => `${name} si unisce alla squadra!`,
    evolved: "EVOLUZIONE!!",
    evolvedText: (w, e, d) => `${w} si è evoluto in «${e}»! ${d}`,
    chest: "Forziere",
    coins30: "Monete +30",
    noteAllRooms: "Tutte le stanze pulite!",
    noteTreasure: (name) => `Hai trovato il tesoro «${name}»!`,
    noteStage: (n, name) => `Il livello ${n}, «${name}», è ora aperto!`,
    noteHard: "La modalità Difficile di questo livello è ora aperta!",
    noteAll: "Tutta la villa splende! Complimenti!",
    noteFirst: (c, m) => `Prima vittoria in ${m} con ${c}!`,
    wornOut: "Esausto…",
    resultSub: (stage, mode, c) => `${stage} · ${mode} · ${c}`,
    clearTime: "Tempo",
    playTime: "Tempo di gioco",
    roomsCleaned: "Stanze pulite",
    houseClean: "Pulizia (tutta la casa)",
    kills: "Rifiuti eliminati",
    level: "Livello",
    coinKills: "Monete (rifiuti)",
    coinClean: "Monete (pulizia)",
    coinDump: "Monete (cassonetti e forzieri)",
    coinRoom: "Monete (stanze e sorgenti)",
    coinBoss: "Monete (boss)",
    coinClear: "Monete (vittoria)",
    coinMul: (hard) => `Moltiplicatore (${hard ? "Difficile, " : ""}abilità)`,
    total: "Totale",
    nextStage: "Livello successivo",
    again: "Riprova",
    shopSub: "Valgono per tutti gli addetti, dalla prossima partita",
    max: "MAX",
    cost: (c) => `${c} monete`,
    killed: (n) => `Eliminati ${n}`,
    se: "Effetti sonori",
    bgm: "Musica",
    shake: "Vibrazioni e lampi",
    haze: "Foschia di sporco",
    reviveTitle: "Ci riprovi?",
    reviveText: "Rialzati sul posto con tutti i PS.",
    reviveBtn: "Rinasci",
    giveUp: "Arrenditi",
    revived: "Di nuovo in piedi! Forza!",
    rerollPlus: "+2 cambi",
    coinsX: (n) => `Monete ×1,5 (+${n})`,
    coinAd: "Monete (bonus ×1,5)",
    withAd: (s) => `📺 Guarda una pubblicità: ${s}`,
    adLoading: "Caricamento pubblicità…",
    adFailed: "Impossibile caricare la pubblicità. Aspetta un momento e riprova",
    howToPlay: "Come si gioca",
    perkReroll: "Cambia scelte",
    perkRerollDesc: "Un cambio di scelte al livello su in ogni partita",
    perkRevive: "Rinascita",
    perkReviveDesc: "Una volta per partita, rialzati con tutti i PS quando sei esausto",
    perkHow: (n, mode) => `Si sblocca trovando il tesoro del livello ${n} (${mode})`,
    perkOn: "Sbloccata (da un tesoro)",
    perkGot: (name) => `Abilità permanente «${name}» sbloccata!`,
    perkTeaser: (name) => `Sblocca l'abilità permanente «${name}»`,
    treasureClue: (stage, mode) => `Indizio: in ${stage} (${mode}), dorme in fondo alla stanza più sporca`,
    treasurePerks: "Abilità sbloccate dai tesori",
    reviveFree: "Rinasci con il potere del tesoro",
  },
  enemies: {
    dust: ["Batuffolo di polvere", "Debole, ma arriva in sciami enormi. Si trova in ogni stanza."],
    hair: ["Groviglio di capelli", "Mescolato alla polvere. Se ti si aggroviglia addosso, ti rallenta un po'."],
    paper: ["Pallina di carta", "Il rifiuto più comune. Ti insegue in linea retta."],
    can: ["Lattina vuota", "Rotola verso di te e ti colpisce. Fa male."],
    bottle: ["Bottiglia di plastica", "Più veloce e dura di una lattina. Rimbalza sui muri."],
    grease: ["Grasso appiccicoso", "Una melma viscida. Sporca il pavimento e ti rallenta molto al contatto."],
    spore: ["Spora di muffa", "Mantiene le distanze e sparge spore. Respirarle provoca un'allergia che toglie PS."],
    bag: ["Sacco della spazzatura", "Scoppia quando lo elimini e rovescia i rifiuti che contiene."],
    pile: ["Mucchio di rifiuti", "Una sorgente che continua a generare rifiuti e sporca il pavimento finché non la distruggi."],
    drain: ["Scarico traboccante", "Una sorgente che sputa grasso appiccicoso e capelli."],
    nest: ["Nido di muffa", "Una sorgente di spore di muffa. Lo spray disinfettante funziona benissimo."],
    boxes: ["Pila di scatoloni", "Una sorgente da cui rotolano palline di carta e lattine."],
    yokai: ["Ghoul della spazzatura", "Il mini-boss che appare a 5:00. Sparge rifiuti mentre si avvicina."],
    kaiju: ["Mostro della muffa", "Il boss che appare a 9:00. Copre il pavimento di muffa e spara spore."],
    master: ["Signore della casa dei rifiuti", "Il boss della sala del padrone. Controlla tutta la casa dei rifiuti."],
  },
  weapons: {
    vacuum: ["Aspirapolvere turbo", "Punta un ugello a cono verso i rifiuti vicini e danneggia tutto ciò che c'è dentro.",
      ["Danno +2", "Portata di aspirazione +15", "Angolo di aspirazione +15°", "Danno +3", "Intervallo di aspirazione −0,06 s", "Portata di aspirazione +20", "Danno +4, angolo +15°"]],
    washer: ["Idropulitrice", "Spara un getto d'acqua sui rifiuti vicini, trapassandoli e respingendoli.",
      ["Getti +1", "Danno +5", "Larghezza del getto +5", "Getti +1", "Danno +6", "Portata +80, intervallo −0,2 s", "Getti +1, danno +6"]],
    robot: ["Robot pulitore", "Ti gira intorno, frantuma i rifiuti e lucida il pavimento.",
      ["Robot +1", "Danno +3", "Raggio dell'orbita +16", "Robot +1", "Rotazione più rapida, danno +3", "Dimensione del robot +4", "Robot +1"]],
    spray: ["Spray disinfettante", "Lascia intorno a te una nebbia disinfettante persistente. Danno doppio alla muffa.",
      ["Nebbie +1", "Dimensione della nebbia +8", "Danno +2", "Durata +0,6 s", "Nebbie +1", "Dimensione della nebbia +10", "Danno +3, nebbie +1"]],
    roller: ["Rullo levapelucchi", "Ti segue e raccoglie rifiuti e sporco lungo il tuo percorso.",
      ["Danno +3", "Larghezza +8", "Danno +3", "Rulli +1", "Larghezza +8", "Danno +4", "Rulli +1"]],
    mop: ["Mocio", "Spazza un ampio arco davanti a te, respinge i rifiuti e strofina a fondo il pavimento.",
      ["Danno +4", "Portata +12", "Intervallo −0,12 s", "Danno +5", "Angolo di spazzata +40°", "Portata +16", "Danno +6, intervallo −0,1 s"]],
    duster: ["Piumino", "Lanciato come un boomerang, spazza i rifiuti all'andata e al ritorno. Trapassa.",
      ["Danno +3", "Piumini +1", "Distanza +40", "Dimensione +4, danno +3", "Piumini +1", "Intervallo −0,25 s", "Danno +5, piumini +1"]],
    bomb: ["Bomba di detersivo", "Lancia detersivo nei gruppi di rifiuti; la schiuma che esplode li pulisce tutti.",
      ["Danno +6", "Dimensione dell'esplosione +10", "Bombe +1", "Intervallo −0,3 s", "Danno +8", "Dimensione dell'esplosione +12", "Bombe +1, danno +6"]],
    purifier: ["Purificatore d'aria", "Mantiene pulita l'aria intorno a te, danneggiando lentamente e respingendo i rifiuti che si avvicinano.",
      ["Raggio +8", "Danno +2", "Intervallo −0,08 s", "Raggio +10", "Danno +3", "Raggio +10, intervallo −0,06 s", "Danno +4"]],
    press: ["Pressa per polvere", "Compatta a poco a poco il contenuto del contenitore polvere per sprigionare un'onda d'urto. Più polvere c'è, più è forte, e libera anche spazio.",
      ["Dimensione dell'onda +20", "Danno +4", "Intervallo −0,6 s", "Quantità compattata +5%", "Dimensione dell'onda +25", "Danno +6", "Intervallo −0,7 s, quantità compattata +5%"]],
    sponge: ["Spugna magica", "Rimbalza sui muri volando per la stanza e strofina via rifiuti e sporco.",
      ["Danno +3", "Spugne +1", "Tempo di volo +1 s", "Dimensione +4", "Danno +4, più veloce", "Spugne +1", "Danno +5, tempo di volo +1 s"]],
  },
  evos: {
    blackhole: ["Aspirapolvere buco nero", "Piazza davanti a te un vortice di aspirazione che danneggia tutti i rifiuti al suo interno."],
    steam: ["Cannone a vapore surriscaldato", "Un raggio di vapore spesso e lungo che fa brillare all'istante tutta la sua traiettoria."],
    army: ["Squadra di robot", "I robot cercano da soli sporco e rifiuti e pattugliano la stanza."],
    acid: ["Nebbia di pioggia acida", "Fa piovere disinfettante su tutto lo schermo."],
    giant: ["Rullo compressore gigante", "Un rullo enorme che fa brillare tutto il tuo percorso e schiaccia i rifiuti."],
    tornado: ["Mocio tornado", "Spazza senza sosta tutto intorno a te ad alta velocità."],
    gale: ["Piumino del dio del vento", "Diversi grandi piumini volano via e riportano la polvere lungo il loro percorso."],
    foam: ["Esplosione di schiuma", "Grandi esplosioni lasciano schiuma che scioglie i rifiuti per un po'."],
    aura: ["Barriera purificante", "Un'enorme barriera che brucia i rifiuti e rallenta tutto ciò che c'è dentro."],
    megapress: ["Megapressa", "Un'onda d'urto che copre lo schermo e pulisce anche il pavimento in un colpo."],
    meteor: ["Pioggia di spugne", "Molte grandi spugne rimbalzano a lungo e lucidano tutta la stanza."],
  },
  passives: {
    battery: ["Batteria extra", "Intervallo d'attacco degli attrezzi −8%"],
    boiler: ["Scaldabagno", "Danno degli attrezzi +10%"],
    roomba: ["Robot pulitore extra", "Numero di attrezzi +1 (getti, robot, nebbie, piumini, bombe, spugne)"],
    bleach: ["Candeggina forte", "Area d'attacco +10%"],
    tape: ["Nastro superadesivo", "Durata degli effetti +10%"],
    dustpack: ["Sacchetto polvere grande", "Capacità del contenitore +40, raggio di raccolta +20%"],
    boots: ["Stivali di gomma", "Dimezza il rallentamento sui pavimenti sporchi, PS +20"],
    gloves: ["Guanti di gomma", "Danno subito −1"],
    hydraulic: ["Cilindro idraulico", "Respinta +25%, capacità del contenitore +15"],
    filter: ["Filtro HEPA", "Rigenera 0,25 PS al secondo"],
    wax: ["Cera per pavimenti", "Velocità di movimento +6%, velocità dei proiettili +10%"],
  },
  chars: {
    cleaner: ["Hajime l'addetto", "Asso della lucidatura", "Raggio di lucidatura camminando +40%", "Un addetto alle pulizie leggendario. Un veterano serio a cui non sfugge una macchia."],
    mizuki: ["Mizuki la lavatrice", "Fanatica della pressione", "Danno +15%", "Un'impaziente esperta di lavaggi che adora la sua idropulitrice."],
    runta: ["Runta il robot", "Ruote fuoristrada", "Non rallenta sui pavimenti sporchi", "Un robot pulitore costruito dai progetti trovati nel ripostiglio."],
    koroko: ["Koroko del rullo", "Brava a raccogliere", "Raggio di raccolta +40%, contenitore +40", "Una ragazza amante dell'ordine che ha ereditato il leggendario rullo levapelucchi."],
    kiyoshi: ["Dott. Kiyoshi", "Immunità di ferro", "Immune alle allergie, +50% di danno alla muffa", "Un dottore dedito allo studio della muffa. Cercava il suo quaderno perduto."],
    tome: ["Nonna Tome", "Saggezza degli anni", "Parte con 2 attrezzi, ESP +25%", "L'ex custode della villa. Lenta di passo, ma nessuno la batte in saggezza ed esperienza."],
  },
  bonus: {
    speed: "Velocità di movimento +10%",
    magnet: "Raggio di raccolta +25%",
    hp: "PS max +20",
    regen: "Rigenera 0,5 PS/s",
    might: "Danno +10%",
    cd: "Intervallo d'attacco −6%",
    box: "Capacità del contenitore +40",
    armor: "Danno subito −1",
    area: "Area d'attacco +10%",
    heal: "Ripristina tutti i PS",
  },
  shop: {
    hp: ["Salute", "PS max +12"],
    might: ["Potenza", "Danno +8%"],
    clean: ["Potere pulente", "Raggio di lucidatura camminando +12%, area pulita dagli attrezzi +6%"],
    speed: ["Velocità", "Velocità di movimento +4%"],
    armor: ["Difesa", "Danno subito −1"],
    regen: ["Rigenerazione", "Rigenera 0,2 PS/s"],
    magnet: ["Raggio di raccolta", "Raggio di raccolta +10%"],
    xp: ["Esperienza", "ESP ottenuta +8%"],
    box: ["Contenitore polvere", "Capacità +20"],
    coin: ["Monete", "Monete ottenute +10%"],
    choices: ["Scelte", "Scelte al livello su 3 → 4"],
  },
  modes: { normal: "Normale", hard: "Difficile" },
  stages: [
    ["La casa dei rifiuti: piano terra", "Intorno al soggiorno. Soprattutto polvere, carta e lattine.",
      { genkan: "Ingresso", rouka: "Corridoio", living: "Soggiorno", washitsu: "Stanza dei tatami", dining: "Sala da pranzo" },
      ["Album di famiglia", "Un vecchio album della famiglia della villa, trovato sotto i rifiuti."]],
    ["La cucina maledetta", "Molto grasso e immondizia. Gli scarichi sputano grasso e il pavimento si risporca in fretta.",
      { rouka: "Corridoio", dining: "Sala da pranzo", kitchen: "Cucina", pantry: "Dispensa", laundry: "Lavanderia", katte: "Porta sul retro" },
      ["Rubinetto d'oro", "Un rubinetto scintillante d'oro massiccio. Una certa esperta d'acqua lo desidera da sempre."]],
    ["I bagni ammuffiti", "Pieni di spore di muffa. Il pavimento del bagno è scivoloso.",
      { rouka: "Corridoio", bath: "Bagno", datsui: "Spogliatoio", toilet: "Toilette", senmen: "Lavabi" },
      ["Sapone di perla", "Un sapone misterioso la cui schiuma brilla come perle."]],
    ["Il ripostiglio sigillato e il primo piano", "Il ripostiglio e lo sgabuzzino sono pieni di scatoloni, e i passaggi sono stretti.",
      { kids: "Cameretta", study: "Studio", hall: "Pianerottolo", storage: "Ripostiglio", nando: "Sgabuzzino" },
      ["Progetti del robot", "I progetti di un robot pulitore, nascosti in fondo al ripostiglio."]],
    ["Il giardino incolto", "Un giardino diviso da siepi. Lo stagno è pieno di muffa.",
      { gate: "Cancello", path: "Vialetto", front: "Giardino davanti", flower: "Aiuola", yard: "Stenditoio", shed: "Capanno", pond: "Riva dello stagno" },
      ["Quadrifoglio", "Un quadrifoglio portafortuna, l'unico che cresce vicino allo stagno."]],
    ["La soffitta polverosa", "Una soffitta dove turbinano polvere e capelli. Scatoloni ovunque.",
      { stairs: "Scala della soffitta", passage: "Passaggio", oldclothes: "Stanza dei vestiti vecchi", chests: "Deposito dei bauli", skylight: "Stanza del lucernario", nook: "Angolino", secret: "Stanza segreta" },
      ["Rullo leggendario", "Un leggendario rullo levapelucchi che, si dice, raccoglie qualsiasi rifiuto."]],
    ["La caldaia del seminterrato", "Un seminterrato invaso da grasso e muffa. Il locale caldaia è pieno di scarichi.",
      { under: "Sotto le scale", corridor: "Corridoio interrato", cellar: "Cantina", washroom: "Zona lavaggio", boiler: "Locale caldaia", store: "Magazzino" },
      ["Vecchio orologio da tasca", "Un orologio trovato dietro la caldaia. Ticchetta ancora."]],
    ["Il garage delle cianfrusaglie", "Un garage disseminato di lattine e bottiglie. Il capanno in fondo è una montagna di scatoloni.",
      { side: "Porta laterale", bench: "Banco da lavoro", garage: "Garage", tools: "Angolo attrezzi", tires: "Pila di pneumatici", back: "Capanno in fondo" },
      ["Quaderno del Dott. Disinfettante", "Gli appunti di un dottore che ha combattuto la muffa per anni. Il proprietario lo sta cercando."]],
    ["Il salone dei banchetti infestato", "Il grande salone dopo la festa. Montagne di immondizia e grasso.",
      { lobby: "Atrio", cloak: "Guardaroba", pantry: "Office", hall: "Salone dei banchetti", stage: "Palco", green: "Camerino" },
      ["Candelabro d'argento", "Un candelabro rimasto sul palco. Il preferito dei fantasmi."]],
    ["La sala del padrone", "L'ultimo livello, dove compaiono tutti i rifiuti. Il boss è il Signore della casa dei rifiuti.",
      { shoko: "Biblioteca", bedroom: "Camera da letto", closet: "Guardaroba", hall: "Salone", master: "Stanza del padrone" },
      ["Chiave della villa", "Una vecchia chiave che apre tutte le porte della villa. Apparteneva all'ex custode."]],
  ],
  hardTreasures: [
    ["Gatto portafortuna", "Un maneki-neko dorato sepolto sulla scarpiera dell'ingresso."],
    ["Mestolo d'argento", "Il pesante mestolo d'argento amato dal cuoco della villa."],
    ["Dado fortunato", "Un dado trovato sul fondo della vasca, che permetterebbe di ritirare il destino."],
    ["Bambola a carica", "Una vecchia bambola che spazza il pavimento con una scopetta quando la carichi."],
    ["Annaffiatoio d'oro", "Uno splendente annaffiatoio dorato sepolto nell'aiuola."],
    ["Piumino della fenice", "Un piumino nascosto in fondo alla soffitta che, si dice, rinasce sempre."],
    ["Ingranaggio d'ottone", "Un grosso ingranaggio lucente staccatosi dal cuore della caldaia."],
    ["Radio rétro", "Una vecchia radio tirata fuori dal mucchio di cianfrusaglie. Funziona ancora."],
    ["Invito spettrale", "Un vecchio invito con i nomi dei fantasmi invitati al banchetto."],
    ["Paletta d'oro", "Una paletta in oro massiccio da cui il Signore della casa non si è mai separato."],
  ],
  tutorial: ["Tutorial", "Una casetta di tre stanze per imparare a giocare.", { genkan: "Ingresso", living: "Soggiorno", washitsu: "Stanza dei tatami" }],
  help: `
    <h2>Come si gioca</h2>
    <p>Libera dai rifiuti una casa stracolma con i tuoi attrezzi per le pulizie e <b>fai splendere tutte le stanze entro 10 minuti</b>. Controlli solo il movimento: gli attrezzi lavorano da soli. I rifiuti eliminati lasciano polvere, che raccogli come esperienza. Quando sali di livello, scegli un nuovo attrezzo o un passivo per diventare più forte. Perdi se scade il tempo o se i tuoi PS arrivano a zero.</p>

    <h3>Tutorial</h3>
    <p>Se sei nuovo, comincia da «Tutorial» nella schermata del titolo (ti viene proposto anche la prima volta che premi «Gioca»). Pulisci una casetta di tre stanze in 2–3 minuti mentre i suggerimenti in basso e una freccia verde ti insegnano il movimento, il livello su, le sorgenti, il completamento delle stanze, i forzieri e i cassonetti. Il tutorial non conta per il completamento.</p>

    <h3>Piante e sorgenti</h3>
    <p>Ci sono 10 livelli. Ogni livello è una casa di 5–7 stanze divise da muri e porte. Nelle stanze ci sono «sorgenti» circondate da un cerchio rosso tratteggiato (mucchi di rifiuti, scarichi, nidi di muffa, pile di scatoloni), da cui esce la maggior parte dei rifiuti. Le sorgenti sporcano il pavimento intorno finché non le distruggi. Inoltre sono avvolte da una «barriera di sporco» (una pellicola marrone) che le rende tanto più dure quanto più è sporco il pavimento intorno. Sopra ogni sorgente vedi la forza della barriera (una barra a 5 livelli) e quanta parte del tuo danno passa ora (ad es. «DANNO 12%»). Più la barra è rossa, più la sorgente è dura. Pulire intorno abbassa la barra e rende efficaci i tuoi attacchi, quindi strofina intorno prima. Più sorgenti distruggi, meno rifiuti compaiono. La minimappa in alto a sinistra mostra quanto è sporca ogni stanza e dove sono le sorgenti (in rosso).</p>

    <h3>Livello di sporco delle stanze (★)</h3>
    <p>Ogni stanza ha un livello di sporco da ★1 a ★5. Più ★ ci sono, più la stanza è sporca, con sorgenti più numerose e dure e molti più rifiuti, e più forti (grasso e muffa compaiono da ★3, i sacchi della spazzatura da ★4). I rifiuti di una stanza ci vagano dentro finché non entri o ti avvicini. Se entri in una stanza ★5 a livello basso verrai sopraffatto in fretta, quindi comincia dalle stanze con meno ★ e rafforzati. I rifiuti delle stanze con molte ★ lasciano più spesso polvere grande.</p>

    <h3>Completare una stanza</h3>
    <p>Distruggi tutte le sorgenti di una stanza e pulisci almeno il 90% del pavimento per completarla (il resto si lucida da solo). Ottieni un forziere e un bonus specifico della stanza (movimento più rapido, più PS max, ecc.), e la stanza non si sporca più.</p>

    <h3>Normale e Difficile</h3>
    <p>Ogni livello ha una modalità Normale e una Difficile. Completare un livello in Normale sblocca il livello successivo e la modalità Difficile di quel livello. In Difficile i rifiuti sono più numerosi e molto più duri, ed è quasi impossibile vincere finché le abilità permanenti non sono a circa metà (l'ultimo livello in Difficile resta 50/50 anche all'80%). Spendi le monete nelle «abilità permanenti» prima di provarci (Difficile dà 1,6 volte le monete).</p>

    <h3>Abilità permanenti</h3>
    <p>Spendi le monete guadagnate per aumentare salute, potenza, potere pulente (quanto largo lucidi il pavimento), velocità, difesa, rigenerazione, raggio di raccolta, esperienza, capienza del contenitore polvere, monete e numero di scelte al livello su. Valgono per tutti gli addetti dalla partita successiva. Aprile con il pulsante «⬆ Abilità» nella schermata del titolo o nella scelta del livello. Quando puoi permetterti un potenziamento, il pulsante brilla d'oro e mostra quanti.</p>

    <h3>Pulsanti ricompensa (rinascita, cambi, monete ×1,5)</h3>
    <p>Quando sei esausto, puoi rialzarti sul posto una volta per partita (tutti i PS, e i rifiuti vicini vengono spazzati via). Se le scelte al livello su non ti piacciono, puoi ottenere 2 cambi. Quando completi un livello, puoi moltiplicare per 1,5 le monete guadagnate. Ogni ricompensa si ottiene guardando una pubblicità ed è disponibile solo se giochi su CrazyGames.</p>

    <h3>Addetti e tesori</h3>
    <p>Ci sono 6 addetti, ognuno con attrezzi iniziali e talento diversi (lucida più largo camminando, non rallenta sui pavimenti sporchi, non soffre di allergie, ecc.). Ogni livello nasconde un tesoro in Normale e uno in Difficile, 20 in tutto; un tesoro appare quando completi la stanza con più ★ in quella modalità. I tesori vengono salvati appena li raccogli. Alcuni tesori di Normale fanno unire un nuovo addetto, e due tesori di Difficile sbloccano le abilità permanenti Cambia scelte e Rinascita. Nella schermata «Obiettivi» (dal titolo) puoi vedere le vittorie di ogni addetto e i tesori raccolti, con indizi per quelli che mancano.</p>

    <h3>Completamento</h3>
    <p>Il completamento conta quanti dei 40 obiettivi hai raggiunto: le vittorie di ogni livello in ogni modalità (10 livelli × 2 modalità = 20) più i tesori (20). Qualsiasi addetto può ottenere una vittoria. Le vittorie dei singoli addetti appaiono nella schermata «Obiettivi» come record extra, ma non contano per il completamento.</p>

    <h3>Pavimenti sporchi</h3>
    <p>Il pavimento è sporco, e più è sporco, più cammini lentamente. Dove passano i tuoi attrezzi, il pavimento diventa pulito. Su un pavimento splendente cammini più veloce e raccogli la polvere da più lontano. Lo sporco si espande piano piano, e i rifiuti sporcano dove passano. Finché tutto è molto sporco, una foschia marrone copre lo schermo; si dirada man mano che pulisci intorno a te e tutta la casa (disattivabile nelle impostazioni).</p>

    <h3>Contenitore polvere e cassonetti</h3>
    <p>La polvere raccolta finisce nel bidone (contenitore polvere) in basso a sinistra. <b>Quando è pieno, il danno degli attrezzi si dimezza, non puoi raccogliere polvere (niente esperienza) e ti muovi più lentamente.</b> Il bidone diventa arancione all'80% e lampeggia in rosso quando è pieno, e una freccia indica il cassonetto più vicino. Mettiti sul <b>cassonetto verde presente in ogni stanza</b> per svuotarlo (guadagni monete). I tuoi PS sono indicati dalla barra sotto il personaggio.</p>

    <h3>Build (slot di attrezzi e passivi)</h3>
    <p>Ci sono 11 tipi di attrezzi per le pulizie, ma in una partita puoi portare <b>solo 4 attrezzi e 4 passivi</b>. Il mocio spazza intorno a te, il piumino va e torna, la bomba di detersivo si lancia nei gruppi di rifiuti, la spugna magica rimbalza sui muri, il purificatore d'aria tiene lontani i rifiuti vicini, la pressa per polvere compatta il contenitore in un'onda d'urto e così via: la tua combinazione cambia il modo in cui combatti. Conviene scegliere un attrezzo insieme al passivo che lo fa evolvere. Le schermate di livello su e dei forzieri mostrano il tuo inventario (attrezzi in blu, passivi in viola) e le ricette di evoluzione (attrezzo + passivo → icona evoluta). Quando entri in una stanza, il suo livello di sporco (★) compare in alto sullo schermo.</p>

    <h3>Evoluzione</h3>
    <p>Porta un attrezzo al livello 8 e apri un forziere avendo il passivo corrispondente per farlo evolvere. I forzieri li lasciano i rifiuti con il bordo dorato, i mini-boss e i boss.</p>
    <table>
      <tbody>
        <tr><th>Aspirapolvere turbo + Batteria extra</th><td>Aspirapolvere buco nero</td></tr>
        <tr><th>Idropulitrice + Scaldabagno</th><td>Cannone a vapore surriscaldato</td></tr>
        <tr><th>Robot pulitore + Robot pulitore extra</th><td>Squadra di robot</td></tr>
        <tr><th>Spray disinfettante + Candeggina forte</th><td>Nebbia di pioggia acida</td></tr>
        <tr><th>Rullo levapelucchi + Nastro superadesivo</th><td>Rullo compressore gigante</td></tr>
        <tr><th>Mocio + Guanti di gomma</th><td>Mocio tornado</td></tr>
        <tr><th>Piumino + Stivali di gomma</th><td>Piumino del dio del vento</td></tr>
        <tr><th>Bomba di detersivo + Sacchetto polvere grande</th><td>Esplosione di schiuma</td></tr>
        <tr><th>Spugna magica + Cera per pavimenti</th><td>Pioggia di spugne</td></tr>
        <tr><th>Purificatore d'aria + Filtro HEPA</th><td>Barriera purificante</td></tr>
        <tr><th>Pressa per polvere + Cilindro idraulico</th><td>Megapressa</td></tr>
      </tbody>
    </table>

    <h3>Comandi su smartphone</h3>
    <table>
      <tbody>
        <tr><th>Tocca lo schermo e trascina</th><td>Muoviti (il punto toccato diventa il centro della levetta)</td></tr>
        <tr><th>Ⅱ in alto a destra</th><td>Pausa</td></tr>
      </tbody>
    </table>

    <h3>Comandi su PC</h3>
    <table>
      <tbody>
        <tr><th>WASD / Frecce</th><td>Muoviti</td></tr>
        <tr><th>P / Esc</th><td>Pausa (nei menu, Esc torna indietro come il pulsante «‹ Indietro» in alto a sinistra)</td></tr>
        <tr><th>1–4</th><td>Scegli al livello su</td></tr>
      </tbody>
    </table>
`,
};
