// おそうじサバイバー: ポルトガル語の文言。text は script.js の TEXT と同じキー、ほかは EN_* と同じ形。help は遊び方の HTML
(window.CS_I18N = window.CS_I18N || {}).pt = {
  text: {
    pageTitle: "Cleaning Survivors",
    pageDesc: "Um jogo de ação no estilo Vampire Survivors: varra ondas de lixo e sujeira com equipamentos de limpeza que atacam sozinhos. 10 fases no Normal e no Difícil. Limpe todos os cômodos em até 10 minutos.",
    gameTitle: "Cleaning Survivors",
    backToGames: "‹ Jogos",
    pause: "Pausa",
    compress: "Compactar",
    board: "Tela do jogo",
    language: "Idioma",
    warn: (name) => `Alerta! ${name} está se aproximando!`,
    rush: "Avalanche de lixo!",
    tooTough: "Duro demais! Limpe ao redor",
    shieldDmg: (n) => `DANO ${n}%`,
    shieldNone: "Sem barreira",
    bossDown: (name) => `${name} eliminado!`,
    srcLeft: (room, n) => `Foco destruído! (${room}: restam ${n})`,
    srcAll: (room) => `Todos os focos de "${room}" destruídos!`,
    dumped: (c) => `Lixo descartado! +${c} moedas`,
    roomDone: (room, bonus) => `${room} brilhando! ${bonus}`,
    roomTreasure: (room) => `${room} brilhando! Um tesouro apareceu!`,
    timeUp: "Acabou o tempo…",
    allClean: "Todos os cômodos limpos!",
    dumpLabel: "LIXO",
    hudDone: (room) => `${room} concluído!`,
    hudRooms: (d, n) => `Cômodos ${d}/${n} concluídos`,
    hudSrc: (s, d, n) => `Focos ${s} · Cômodos ${d}/${n} concluídos`,
    hudKills: (k) => `Eliminados ${k}`,
    hudHp: (a, b) => `PV ${a}/${b}`,
    hudBoxFull: "CHEIO!",
    hudBox: (a, b) => `Caixa de poeira ${a}/${b}`,
    completion: "Progresso",
    completionMeta: (c, ct, tr, tt) => `Vitórias ${c}/${ct} · Tesouros ${tr}/${tt}`,
    logoSmall: "ESFREGAR · VARRER · SOBREVIVER",
    logo: "CLEANING<br>SURVIVORS",
    tagline: "Varra ondas de lixo e sujeira com seu equipamento de limpeza!",
    play: "Jogar",
    cleaners: "Faxineiros",
    tutorial: "Tutorial",
    tutAskTitle: "É novo por aqui?",
    tutAskText: "Quer aprender o básico no <b>tutorial</b> primeiro? Você vai limpar uma casinha de três cômodos em <b>2–3 minutos</b>, com dicas pelo caminho.",
    tutAskPlay: "Jogar o tutorial",
    tutAskSkip: "Pular",
    tutAskNote: "Se você pular, esta mensagem não vai aparecer de novo. Você pode jogar o tutorial quando quiser pela tela de título ou pela seleção de fase.",
    tutorialMeta: "Uma casinha de três cômodos para aprender o básico em 2–3 minutos",
    recommended: "Para iniciantes",
    toStage1: "Ir para a fase 1",
    noteTutorial: "Tutorial concluído! Agora encare a fase 1, \"A casa do lixo: térreo\"",
    noteTutorialRetry: "Tente o tutorial de novo",
    tutMove: "Primeiro, experimente andar. Mova-se com <b>WASD / setas</b> (no celular, arraste o dedo na tela). Seu equipamento de limpeza funciona <b>sozinho</b>",
    tutKill: "Chegue perto do lixo. Seu equipamento causa dano <b>automaticamente</b> ao lixo próximo. Fique de olho na <b>barra de PV</b> embaixo do personagem",
    tutDust: "O lixo eliminado deixa <b>poeira</b> (losangos). Recolha para ganhar experiência e <b>subir de nível</b>",
    tutLevelUp: (a, b) => `Subiu de nível! Escolha um equipamento ou uma passiva. Você só pode levar ${a} equipamentos e ${b} passivas, então pense na combinação`,
    tutSource: "O círculo vermelho pontilhado é um <b>foco</b>, de onde sai o lixo. A barra acima é a <b>barreira de sujeira</b>, que enfraquece conforme você limpa o chão ao redor. Esfregue ao redor e depois destrua",
    tutRoom: "<b>Destrua todos os focos</b> de um cômodo e limpe <b>pelo menos 90%</b> do chão para concluí-lo. O % no canto superior direito mostra o quanto o cômodo está limpo",
    tutChest: "Cômodo concluído! Você ganha um <b>baú</b> e um bônus do cômodo. Pegue o baú para abri-lo",
    tutDump: "A poeira recolhida enche a <b>lixeira</b> (caixa de poeira) no canto inferior esquerdo. <b>Cheia, seu dano cai pela metade, você não recolhe poeira e fica mais lento</b>. Fique em cima do <b>ponto de coleta verde</b> que existe em cada cômodo para esvaziá-la",
    tutDanger: "Quanto mais ★ um cômodo tem, mais sujo ele está e mais duro é o lixo, então <b>comece pelos de menos ★</b>. Nas fases de verdade, você vence limpando <b>todos os cômodos em até 10 minutos</b>. Limpe os cômodos que faltam!",
    achievements: "Conquistas",
    achClears: "Vitórias por faxineiro",
    settings: "Configurações",
    stageSelect: "Escolha uma fase",
    recordOf: (name) => `Recordes de ${name}`,
    coins: "Moedas",
    hardNote: "Difícil: PV e dano do lixo e dos focos de cerca de 3 a 7 vezes os do Normal (varia por fase), quantidade ×1,2. Moedas ×1,6. Suba antes suas habilidades permanentes até mais ou menos a metade. A última fase é 50/50 mesmo com 80%.",
    lockedPrev: "Vença a fase anterior no Normal para entrar",
    lockedHard: "Vença esta fase no Normal para liberar o Difícil",
    bestRooms: (r, n) => `Melhor: ${r}/${n} cômodos`,
    bestClear: (time) => `Melhor tempo ${time}`,
    roomCount: (n) => `${n} cômodos`,
    badgeTreasure: "T",
    treasure: "Tesouro",
    skills: "Habilidades",
    zukan: "Guia do lixo",
    toTitle: "Título",
    unlockText: (n, stage) => `Entra para a equipe quando você encontrar o tesouro da fase ${n}, "${stage}"`,
    trait: (name, desc) => `Traço "${name}": ${desc}`,
    charStats: (hp, gears) => `PV ${hp} · Equipamento inicial: ${gears}`,
    charPower: (s) => `Força ${s}`,
    charFav: (b, n) => `Build favorita: ${b} (dano do equipamento favorito +${n}%)`,
    sep: ", ",
    stageTitle: (n, name) => `Fase ${n}: ${name}`,
    planAlt: "Planta",
    briefDesc: "<b>Limpe todos os cômodos em até 10 minutos</b> para vencer a fase. Destrua todos os <b>focos</b> (pontos vermelhos) de um cômodo e deixe o chão brilhando para concluí-lo e ganhar um baú e um bônus. <b>Quanto mais ★ um cômodo tem, mais sujo ele está</b>, com mais lixo e mais duro. Se entrar cedo demais, você vai ser sobrepujado, então comece pelos cômodos de menos ★. Os focos são <b>mais duros quanto mais sujo estiver ao redor</b>, então esfregue ao redor primeiro.",
    srcCount: (n) => `Focos ${n}`,
    treasureFoundLine: (name) => `Tesouro "${name}" encontrado!`,
    treasureHint: (cond) => `Tesouro: ${cond}`,
    joined: (name) => `${name} entrou para a equipe`,
    willJoin: "Encontrar este tesouro libera um novo faxineiro",
    bossNote: (mid, boss) => `O subchefe "${mid}" aparece aos 5:00, e o chefe "${boss}" aos 9:00.`,
    cleared: "Vencida",
    pickCleaner: "Escolha seu faxineiro",
    deploy: (mode) => `Começar (${mode})`,
    back: "Voltar",
    charsSub: "As vitórias de cada faxineiro em cada fase e modo contam para o progresso. Escolha um faxineiro para ver as vitórias dele por fase e modo",
    treasures: (a, b) => `Tesouros (${a}/${b})`,
    roomsCell: (r, n) => `${r}/${n} cômodos`,
    clears: (a, b) => `Vitórias ${a}/${b}`,
    stage: "Fase",
    useCleaner: "Usar este faxineiro",
    planStart: "INÍCIO",
    paused: "Pausa",
    pauseSub: (stage, left, d, n) => `${stage} · faltam ${left} · Cômodos limpos ${d}/${n}`,
    resume: "Continuar",
    retry: "Recomeçar",
    toStages: "Seleção de fase",
    onigiri: "Onigiri",
    onigiriDesc: "Recupera 50 PV",
    savings: "Economias secretas",
    savingsDesc: "Moedas +10",
    evoWith: (p) => `Evolui com ${p}`,
    evoChest: "Abra um baú para evoluir!",
    evoNeed: (p) => `Pode evoluir se você tiver ${p}`,
    evoFor: (w) => `Necessário para evoluir ${w}`,
    pickOne: "Escolha um equipamento ou uma passiva",
    tagGear: "Equip.",
    canUpgrade: (n) => `${n} melhorias disponíveis`,
    shopCta: (c, n) => `Você tem ${c} moedas! Há ${n} melhorias de habilidades permanentes disponíveis, e elas valem para todas as partidas seguintes`,
    recipeAria: (g, p, e) => `${g} + ${p} evolui para ${e}`,
    boxFullBanner: "Lixeira CHEIA! Vá até um ponto de coleta",
    boxFullNag: "CHEIA! Não dá para recolher poeira",
    boxNear: "Quase cheia",
    dangerWord1: "Sujeira 1 · Fácil",
    dangerWord2: "Sujeira 2 · Normal",
    dangerWord3: "Sujeira 3 · Duro",
    dangerWord4: "Sujeira 4 · Perigo!",
    dangerWord5: "Sujeira 5 · Extremo!!",
    tagPassive: "Passiva",
    inventory: "O que você tem",
    emptySlot: "Vazio",
    slots: (g, gm, p, pm) => `Equipamentos ${g}/${gm} · Passivas ${p}/${pm}`,
    slotNote: (g, p) => `Você só pode levar ${g} equipamentos e ${p} passivas, então sua combinação decide como você luta.`,
    reroll: (n) => `Trocar opções (restam ${n})`,
    treasureNew: "Tesouro encontrado!",
    owned: " (já possui)",
    joinedBang: (name) => `${name} entrou para a equipe!`,
    evolved: "EVOLUIU!!",
    evolvedText: (w, e, d) => `${w} evoluiu para "${e}"! ${d}`,
    chest: "Baú",
    coins30: "Moedas +30",
    noteAllRooms: "Todos os cômodos limpos!",
    noteTreasure: (name) => `Você encontrou o tesouro "${name}"!`,
    noteStage: (n, name) => `A fase ${n}, "${name}", está liberada!`,
    noteHard: "O Difícil desta fase está liberado!",
    noteAll: "A mansão inteira está brilhando! Parabéns!",
    noteFirst: (c, m) => `Primeira vitória no ${m} com ${c}!`,
    wornOut: "Sem forças…",
    resultSub: (stage, mode, c) => `${stage} · ${mode} · ${c}`,
    clearTime: "Tempo",
    playTime: "Tempo de jogo",
    roomsCleaned: "Cômodos limpos",
    houseClean: "Limpeza (casa toda)",
    kills: "Lixo eliminado",
    level: "Nível",
    coinKills: "Moedas (lixo)",
    coinClean: "Moedas (limpeza)",
    coinDump: "Moedas (coleta e baús)",
    coinRoom: "Moedas (cômodos e focos)",
    coinBoss: "Moedas (chefes)",
    coinClear: "Moedas (vitória)",
    coinMul: (hard) => `Multiplicador (${hard ? "Difícil, " : ""}habilidades)`,
    total: "Total",
    nextStage: "Próxima fase",
    again: "De novo",
    shopSub: "Vale para todos os faxineiros, a partir da próxima partida",
    max: "MÁX",
    cost: (c) => `${c} moedas`,
    killed: (n) => `Eliminados ${n}`,
    se: "Efeitos sonoros",
    bgm: "Música",
    shake: "Tremor e flashes",
    haze: "Névoa de sujeira",
    reviveTitle: "Quer tentar de novo?",
    reviveText: "Levante-se ali mesmo com todos os PV.",
    reviveBtn: "Reviver",
    giveUp: "Desistir",
    revived: "De volta! Continue!",
    rerollPlus: "+2 trocas",
    coinsX: (n) => `Moedas ×1,5 (+${n})`,
    coinAd: "Moedas (bônus ×1,5)",
    withAd: (s) => `📺 Ver um anúncio: ${s}`,
    adLoading: "Carregando anúncio…",
    adFailed: "Não foi possível carregar um anúncio. Espere um pouco e tente de novo",
    howToPlay: "Como jogar",
    perkReroll: "Trocar opções",
    perkRerollDesc: "Uma troca de opções ao subir de nível em toda partida",
    perkRevive: "Reviver",
    perkReviveDesc: "Uma vez por partida, levante-se com todos os PV quando ficar sem forças",
    perkHow: (n, mode) => `Liberada ao encontrar o tesouro da fase ${n} (${mode})`,
    perkOn: "Liberada (por um tesouro)",
    perkGot: (name) => `Habilidade permanente "${name}" liberada!`,
    perkTeaser: (name) => `Libera a habilidade permanente "${name}"`,
    treasureClue: (stage, mode, cond) => `Dica (${stage}, ${mode}): ${cond}`,
    condRoom: (room) => `Concluir o cômodo com mais ★, "${room}"`,
    condKills: (n, enemy) => `Eliminar ${n} × ${enemy} em uma partida`,
    condRoomTime: (room, time) => `Concluir "${room}" em até ${time}`,
    condSrcTime: (time) => `Destruir todos os focos da casa em até ${time}`,
    condClearTime: (time) => `Limpar todos os cômodos em até ${time}`,
    condBoss: (boss) => `Derrotar "${boss}"`,
    condDumps: (n) => `Esvaziar a lixeira ${n} vezes em uma partida`,
    condHpKeep: (pct) => `Vencer a fase sem que seu PV caia abaixo de ${pct}%`,
    treasureAppeared: "Um tesouro apareceu!",
    hudTreasure: (s) => `Tesouro ${s}`,
    hudDumpCount: (a, b) => `Coletas ${a}/${b}`,
    hudTimeLeft: (s) => `faltam ${s}`,
    treasurePerks: "Habilidades liberadas por tesouros",
    reviveFree: "Reviver com o poder do tesouro",
  },
  enemies: {
    dust: ["Bolinha de poeira", "Fraca, mas vem em enxames enormes. Está em todos os cômodos."],
    hair: ["Bola de cabelo", "Vem misturada à poeira. Se enroscar em você, deixa você um pouco mais lento."],
    paper: ["Bolinha de papel", "O lixo mais comum. Persegue você em linha reta."],
    can: ["Lata vazia", "Rola até você e dá uma trombada. Dói."],
    bottle: ["Garrafa PET", "Mais rápida e dura que uma lata. Quica nas paredes."],
    grease: ["Gordura grudenta", "Uma gosma pegajosa. Suja o chão por onde passa e deixa você bem mais lento ao encostar."],
    spore: ["Esporo de mofo", "Mantém distância e espalha esporos. Respirá-los causa uma alergia que tira PV."],
    bag: ["Saco de lixo", "Estoura quando eliminado e espalha o lixo que tem dentro."],
    pile: ["Monte de lixo", "Um foco que gera lixo sem parar e suja o chão até você destruí-lo."],
    drain: ["Ralo transbordando", "Um foco que cospe gordura grudenta e cabelo."],
    nest: ["Ninho de mofo", "Um foco de esporos de mofo. O spray desinfetante funciona muito bem."],
    boxes: ["Pilha de caixas", "Um foco de onde rolam bolinhas de papel e latas."],
    yokai: ["Assombração do lixo", "O subchefe que aparece aos 5:00. Espalha lixo enquanto se aproxima."],
    kaiju: ["Monstro do mofo", "O chefe que aparece aos 9:00. Cobre o chão de mofo e dispara esporos."],
    master: ["Senhor da casa do lixo", "O chefe da sala do senhor. Controla toda a casa do lixo."],
  },
  weapons: {
    vacuum: ["Aspirador turbo", "Aponta um bocal em cone para o lixo próximo e causa dano a tudo dentro dele.",
      ["Dano +2", "Alcance da sucção +15", "Ângulo da sucção +15°", "Dano +3", "Intervalo da sucção −0,06 s", "Alcance da sucção +20", "Dano +4, ângulo +15°"]],
    washer: ["Lavadora de alta pressão", "Dispara um jato d'água no lixo próximo, atravessando e empurrando.",
      ["Jatos +1", "Dano +5", "Largura do jato +5", "Jatos +1", "Dano +6", "Alcance +80, intervalo −0,2 s", "Jatos +1, dano +6"]],
    robot: ["Robô aspirador", "Gira ao seu redor, esmaga o lixo e dá brilho ao chão.",
      ["Robôs +1", "Dano +3", "Raio da órbita +16", "Robôs +1", "Giro mais rápido, dano +3", "Tamanho do robô +4", "Robôs +1"]],
    spray: ["Spray desinfetante", "Deixa ao seu redor uma névoa desinfetante que dura um tempo. Dano dobrado contra mofo.",
      ["Névoas +1", "Tamanho da névoa +8", "Dano +2", "Duração +0,6 s", "Névoas +1", "Tamanho da névoa +10", "Dano +3, névoas +1"]],
    roller: ["Rolo tira-pelos", "Segue você e recolhe o lixo e a sujeira do caminho.",
      ["Dano +3", "Largura +8", "Dano +3", "Rolos +1", "Largura +8", "Dano +4", "Rolos +1"]],
    mop: ["Esfregão", "Varre um arco amplo à frente, afasta o lixo e esfrega bem o chão.",
      ["Dano +4", "Alcance +12", "Intervalo −0,12 s", "Dano +5", "Ângulo da varrida +40°", "Alcance +16", "Dano +6, intervalo −0,1 s"]],
    duster: ["Espanador", "Lançado como um bumerangue, varre o lixo na ida e na volta. Atravessa.",
      ["Dano +3", "Espanadores +1", "Distância +40", "Tamanho +4, dano +3", "Espanadores +1", "Intervalo −0,25 s", "Dano +5, espanadores +1"]],
    bomb: ["Bomba de detergente", "Joga detergente nos grupos de lixo; a espuma que estoura limpa todos.",
      ["Dano +6", "Tamanho da explosão +10", "Bombas +1", "Intervalo −0,3 s", "Dano +8", "Tamanho da explosão +12", "Bombas +1, dano +6"]],
    purifier: ["Purificador de ar", "Mantém o ar limpo ao seu redor, causando dano aos poucos e afastando o lixo que chega perto.",
      ["Raio +8", "Dano +2", "Intervalo −0,08 s", "Raio +10", "Dano +3", "Raio +10, intervalo −0,06 s", "Dano +4"]],
    press: ["Prensa de poeira", "Compacta aos poucos o conteúdo da caixa de poeira e solta uma onda de choque. Quanto mais poeira, mais forte, e ainda libera espaço na caixa.",
      ["Tamanho da onda +20", "Dano +4", "Intervalo −0,6 s", "Quantidade compactada +5%", "Tamanho da onda +25", "Dano +6", "Intervalo −0,7 s, quantidade compactada +5%"]],
    sponge: ["Esponja mágica", "Quica nas paredes voando pelo cômodo e esfrega o lixo e a sujeira.",
      ["Dano +3", "Esponjas +1", "Tempo de voo +1 s", "Tamanho +4", "Dano +4, mais rápida", "Esponjas +1", "Dano +5, tempo de voo +1 s"]],
  },
  evos: {
    blackhole: ["Aspirador buraco negro", "Coloca à frente um vórtice de sucção que causa dano a todo o lixo dentro dele."],
    steam: ["Canhão de vapor superaquecido", "Um raio de vapor grosso e longo que deixa brilhando na hora tudo em sua linha."],
    army: ["Esquadrão de robôs", "Robôs em maior número e maiores giram mais rápido ao seu redor, esmagam o lixo e dão brilho a uma área maior."],
    acid: ["Névoa de chuva ácida", "Faz chover desinfetante na tela inteira."],
    giant: ["Rolo compressor gigante", "Um rolo enorme que deixa brilhando todo o seu caminho e esmaga o lixo."],
    tornado: ["Esfregão tornado", "Varre sem parar ao seu redor em alta velocidade."],
    gale: ["Espanador do deus do vento", "Vários espanadores grandes saem voando e trazem de volta a poeira do caminho."],
    foam: ["Explosão de espuma", "Grandes explosões deixam uma espuma que dissolve o lixo por um tempo."],
    aura: ["Barreira purificadora", "Uma barreira enorme que queima o lixo e deixa lento tudo o que está dentro."],
    megapress: ["Megaprensa", "Uma onda de choque do tamanho da tela que também limpa o chão de uma vez."],
    meteor: ["Chuva de esponjas", "Muitas esponjas grandes quicam por bastante tempo e dão brilho ao cômodo todo."],
  },
  passives: {
    battery: ["Bateria extra", "Intervalo de ataque dos equipamentos −8%"],
    boiler: ["Aquecedor de água", "Dano dos equipamentos +10%"],
    roomba: ["Robô aspirador extra", "Quantidade de equipamentos +1 (jatos, robôs, névoas, espanadores, bombas, esponjas)"],
    bleach: ["Água sanitária forte", "Área de ataque +10%"],
    tape: ["Fita superadesiva", "Duração dos efeitos +10%"],
    dustpack: ["Saco de poeira grande", "Capacidade da caixa +40, alcance de coleta +20%"],
    boots: ["Botas de borracha", "Reduz pela metade a lentidão em chão sujo, PV +20"],
    gloves: ["Luvas de borracha", "Dano recebido −1"],
    hydraulic: ["Cilindro hidráulico", "Empurrão +25%, capacidade da caixa +15"],
    filter: ["Filtro HEPA", "Regenera 0,25 PV por segundo"],
    wax: ["Cera de chão", "Velocidade de movimento +6%, velocidade dos projéteis +10%"],
  },
  chars: {
    cleaner: ["Hajime, o faxineiro", "Mestre do brilho", "Raio de polimento ao andar +40%", "Um faxineiro lendário. Um veterano sério que não deixa escapar nenhuma mancha."],
    mizuki: ["Mizuki, a lavadeira", "Fanática por pressão", "Dano +15%", "Uma lavadeira impaciente que adora sua lavadora de alta pressão."],
    runta: ["Runta, o robô", "Rodas off-road", "Não fica lento em chão sujo", "Um robô aspirador construído com as plantas do depósito."],
    koroko: ["Koroko do rolo", "Ótima coletora", "Alcance de coleta +40%, caixa +40", "Uma garota que adora arrumar e herdou o lendário rolo tira-pelos."],
    kiyoshi: ["Dr. Kiyoshi", "Imunidade de ferro", "Imune a alergias, +50% de dano contra mofo", "Um doutor dedicado à pesquisa do mofo. Procurava seu caderno perdido."],
    tsugumi: ["Tsugumi, a aprendiz", "Ainda aprendiz", "Dano −20%, EXP +10%", "Uma aprendiz que acabou de chegar à mansão. Mas com a esponja mágica ninguém a vence."],
    hayate: ["Hayate, o vendaval", "Espanador vendaval", "Intervalo de ataque −10%", "Um faxineiro veloz que joga espanadores como o vento. Aguenta mal os golpes."],
    reika: ["Senhorita Reika", "Menina mimada", "Pouco PV, lenta e dano −15%, mas moedas +30%", "Uma senhorita criada numa mansão. Sem o purificador de ar, não dá um passo."],
    gou: ["Gou, o chefão", "Garra de chefão", "Dano +15%, dano recebido −2", "Um chefão durão que limpou a cidade inteira com um só esfregão. Ninguém na mansão aguenta mais."],
    tome: ["Vovó Tome", "Sabedoria da idade", "Começa com 2 equipamentos, EXP +25%", "A antiga zeladora da mansão. Lenta para andar, mas ninguém supera sua sabedoria e experiência."],
  },
  bonus: {
    speed: "Velocidade de movimento +10%",
    magnet: "Alcance de coleta +25%",
    hp: "PV máx. +20",
    regen: "Regenera 0,5 PV/s",
    might: "Dano +10%",
    cd: "Intervalo de ataque −6%",
    box: "Capacidade da caixa +40",
    armor: "Dano recebido −1",
    area: "Área de ataque +10%",
    heal: "Recupera todos os PV",
  },
  shop: {
    hp: ["Saúde", "PV máx. +12"],
    might: ["Força", "Dano +8%"],
    clean: ["Poder de limpeza", "Raio de polimento ao andar +12%, área limpa pelos equipamentos +6%"],
    speed: ["Velocidade", "Velocidade de movimento +4%"],
    armor: ["Defesa", "Dano recebido −1"],
    regen: ["Regeneração", "Regenera 0,2 PV/s"],
    magnet: ["Alcance de coleta", "Alcance de coleta +10%"],
    xp: ["Experiência", "EXP recebida +8%"],
    box: ["Caixa de poeira", "Capacidade +20"],
    coin: ["Moedas", "Moedas recebidas +10%"],
    choices: ["Opções", "Opções ao subir de nível 3 → 4"],
  },
  modes: { normal: "Normal", hard: "Difícil" },
  stages: [
    ["A casa do lixo: térreo", "Ao redor da sala de estar. Principalmente poeira, papel e latas.",
      { genkan: "Entrada", rouka: "Corredor", living: "Sala de estar", washitsu: "Sala de tatame", dining: "Sala de jantar" },
      ["Álbum de família", "Um álbum antigo da família da mansão, encontrado debaixo do lixo."]],
    ["A cozinha amaldiçoada", "Muita gordura e lixo orgânico. Os ralos cospem gordura e o chão se suja rapidinho.",
      { rouka: "Corredor", dining: "Sala de jantar", kitchen: "Cozinha", pantry: "Despensa", laundry: "Lavanderia", katte: "Porta dos fundos" },
      ["Torneira de ouro", "Uma torneira reluzente de ouro maciço. Uma certa especialista em água sempre quis uma."]],
    ["Os banheiros mofados", "Cheios de esporos de mofo. O chão do banheiro é escorregadio.",
      { rouka: "Corredor", bath: "Banheiro", datsui: "Vestiário", toilet: "Lavabo", senmen: "Pias" },
      ["Sabonete de pérola", "Um sabonete misterioso cuja espuma brilha como pérolas."]],
    ["O depósito trancado e o andar de cima", "O depósito e o armário estão cheios de caixas, e as passagens são estreitas.",
      { kids: "Quarto das crianças", study: "Escritório", hall: "Hall da escada", storage: "Depósito", nando: "Armário" },
      ["Plantas do robô", "As plantas de um robô aspirador, escondidas no fundo do depósito."]],
    ["O jardim abandonado", "Um jardim dividido por cercas vivas. O lago está cheio de mofo.",
      { gate: "Portão", path: "Caminho", front: "Jardim da frente", flower: "Canteiro", yard: "Varal", shed: "Galpão", pond: "Beira do lago" },
      ["Trevo de quatro folhas", "Um trevo da sorte, o único que cresce à beira do lago."]],
    ["O sótão empoeirado", "Um sótão onde rodopiam poeira e cabelos. Caixas por toda parte.",
      { stairs: "Escada do sótão", passage: "Passagem", oldclothes: "Quarto de roupas velhas", chests: "Canto dos baús", skylight: "Quarto da claraboia", nook: "Cantinho", secret: "Quarto secreto" },
      ["Rolo lendário", "Um lendário rolo tira-pelos que, dizem, recolhe qualquer lixo."]],
    ["A casa de caldeiras do porão", "Um porão tomado por gordura e mofo. A casa de caldeiras está cheia de ralos.",
      { under: "Debaixo da escada", corridor: "Corredor do porão", cellar: "Adega", washroom: "Área de lavagem", boiler: "Casa de caldeiras", store: "Almoxarifado" },
      ["Relógio de bolso antigo", "Um relógio encontrado atrás da caldeira. Ainda funciona."]],
    ["A garagem da tralha", "Uma garagem cheia de latas e garrafas. O galpão dos fundos é uma montanha de caixas.",
      { side: "Porta lateral", bench: "Bancada", garage: "Garagem", tools: "Canto das ferramentas", tires: "Pilha de pneus", back: "Galpão dos fundos" },
      ["Caderno do Dr. Desinfetante", "As anotações de um doutor que combateu o mofo por anos. O dono está procurando."]],
    ["O salão de banquetes assombrado", "O grande salão depois da festa. Montanhas de lixo e gordura.",
      { lobby: "Saguão", cloak: "Chapelaria", pantry: "Copa", hall: "Salão de banquetes", stage: "Palco", green: "Camarim" },
      ["Castiçal de prata", "Um castiçal esquecido no palco. O favorito dos fantasmas."]],
    ["A sala do senhor", "A última fase, onde aparece todo tipo de lixo. O chefe é o Senhor da casa do lixo.",
      { shoko: "Biblioteca", bedroom: "Quarto", closet: "Closet", hall: "Salão principal", master: "Aposento do senhor" },
      ["Chave da mansão", "Uma chave antiga que abre todas as portas da mansão. Pertencia à antiga zeladora."]],
  ],
  hardTreasures: [
    ["Gato da sorte", "Um maneki-neko dourado soterrado em cima da sapateira da entrada."],
    ["Concha de prata", "A pesada concha de prata que o cozinheiro da mansão adorava."],
    ["Dado da sorte", "Um dado do fundo da banheira; dizem que permite rolar o destino de novo."],
    ["Boneca de corda", "Uma boneca antiga que varre o chão com uma vassourinha quando se dá corda."],
    ["Regador dourado", "Um regador dourado e reluzente enterrado no canteiro."],
    ["Espanador da fênix", "Um espanador escondido no fundo do sótão que, dizem, renasce sempre."],
    ["Engrenagem de latão", "Uma grande engrenagem brilhante que se soltou do coração da caldeira."],
    ["Rádio retrô", "Um rádio antigo tirado do monte de tralha. Ainda toca."],
    ["Convite fantasma", "Um convite antigo com os nomes dos fantasmas chamados para o banquete."],
    ["Pá de lixo dourada", "Uma pá de lixo de ouro maciço que o Senhor da casa nunca largou."],
  ],
  tutorial: ["Tutorial", "Uma casinha de três cômodos para aprender a jogar.", { genkan: "Entrada", living: "Sala de estar", washitsu: "Sala de tatame" }],
  help: `
    <h2>Como jogar</h2>
    <p>Tire o lixo de uma casa abarrotada com seu equipamento de limpeza e <b>deixe todos os cômodos brilhando em até 10 minutos</b>. Você só controla o movimento: o equipamento de limpeza funciona sozinho. O lixo eliminado deixa poeira, que você recolhe como experiência. Ao subir de nível, escolha um novo equipamento ou uma passiva para ficar mais forte. Você perde se o tempo acabar ou seus PV chegarem a zero.</p>

    <h3>Tutorial</h3>
    <p>Se você é novo, comece pelo "Tutorial" na tela de título (ele também é oferecido na primeira vez que você aperta "Jogar"). Você limpa uma casinha de três cômodos em 2–3 minutos enquanto as dicas na parte de baixo da tela e uma seta verde ensinam o movimento, subir de nível, os focos, concluir cômodos, os baús e os pontos de coleta. O tutorial não conta para o progresso.</p>

    <h3>Plantas e focos</h3>
    <p>São 10 fases. Cada fase é uma casa de 5–7 cômodos separados por paredes e portas. Os cômodos têm "focos" cercados por um círculo vermelho pontilhado (montes de lixo, ralos, ninhos de mofo, pilhas de caixas), de onde sai a maior parte do lixo. Os focos sujam o chão ao redor até você destruí-los. Eles também ficam envoltos numa "barreira de sujeira" (uma película marrom) que os deixa mais duros quanto mais sujo estiver o chão ao redor. Acima de cada foco aparecem a força da barreira (uma barra de 5 níveis) e quanto do seu dano está passando (por ex. "DANO 12%"). Quanto mais vermelha a barra, mais duro o foco. Limpar ao redor abaixa a barra e faz seus ataques funcionarem, então esfregue ao redor primeiro. Quanto mais focos você destrói, menos lixo aparece. O minimapa no canto superior esquerdo mostra o quanto cada cômodo está sujo e onde estão os focos (em vermelho).</p>

    <h3>Nível de sujeira dos cômodos (★)</h3>
    <p>Cada cômodo tem um nível de sujeira de ★1 a ★5. Quanto mais ★, mais sujo o cômodo, com focos mais numerosos e duros e muito mais lixo, e mais forte (gordura e mofo aparecem a partir de ★3, sacos de lixo a partir de ★4). O lixo de um cômodo fica vagando por ele até você entrar ou chegar perto. Se entrar num cômodo ★5 com nível baixo, você vai ser derrotado rapidinho, então comece pelos cômodos de menos ★ e fique mais forte. O lixo dos cômodos com muitas ★ deixa poeira grande com mais frequência.</p>

    <h3>Concluir um cômodo</h3>
    <p>Destrua todos os focos de um cômodo e limpe pelo menos 90% do chão para concluí-lo (o resto ganha brilho sozinho). Você ganha um baú e um bônus próprio do cômodo (movimento mais rápido, mais PV máximos etc.), e o cômodo nunca mais fica sujo.</p>

    <h3>Normal e Difícil</h3>
    <p>Cada fase tem o modo Normal e o modo Difícil. Vencer uma fase no Normal libera a próxima fase e o Difícil daquela fase. No Difícil há mais lixo e muito mais duro, e é quase impossível vencer antes de as habilidades permanentes estarem mais ou menos na metade (a última fase no Difícil é 50/50 mesmo com 80%). Gaste moedas em "habilidades permanentes" antes de tentar (o Difícil dá 1,6 vez mais moedas).</p>

    <h3>Habilidades permanentes</h3>
    <p>Gaste as moedas que ganhar para aumentar saúde, força, poder de limpeza (a largura com que você dá brilho ao chão), velocidade, defesa, regeneração, alcance de coleta, experiência, tamanho da caixa de poeira, moedas e número de opções ao subir de nível. Elas valem para todos os faxineiros a partir da próxima partida. Abra pelo botão "⬆ Habilidades" na tela de título ou na seleção de fase. Quando você pode pagar uma melhoria, o botão brilha em dourado e mostra quantas.</p>

    <h3>Botões de recompensa (reviver, trocas, moedas ×1,5)</h3>
    <p>Quando ficar sem forças, você pode se levantar ali mesmo uma vez por partida (com todos os PV, e o lixo próximo é jogado longe). Se não gostar das opções ao subir de nível, você pode ganhar 2 trocas. Ao vencer uma fase, você pode multiplicar por 1,5 as moedas ganhas. Cada recompensa é ganha assistindo a um anúncio e só está disponível jogando no CrazyGames.</p>

    <h3>Faxineiros e tesouros</h3>
    <p>São 10 faxineiros, cada um com equipamento inicial e traço diferentes. O equipamento inicial é o equipamento favorito do faxineiro e causa +25% de dano (a build favorita aparece no perfil). A força vai de ★1 a ★5; os faxineiros ★1 têm pouco PV ou pouco dano e servem de desafio. Cada fase esconde um tesouro no Normal e outro no Difícil, 20 no total. Cada tesouro tem sua própria condição (concluir o cômodo com mais ★, eliminar uma quantidade de um tipo de lixo, limpar um cômodo dentro de um tempo, derrotar um chefe etc.), mostrada na tela antes de começar e na lista de tesouros. Durante a partida, o progresso aparece no canto superior direito, e o tesouro surge perto de você quando a condição é cumprida (condições cumpridas ao vencer a fase são entregues na vitória). Os tesouros são salvos assim que você os pega. Alguns tesouros do Normal fazem um novo faxineiro entrar para a equipe, e dois tesouros do Difícil liberam as habilidades permanentes Trocar opções e Reviver. Na tela "Conquistas" (pelo título) você vê as vitórias de cada faxineiro e os tesouros reunidos, com dicas dos que faltam.</p>

    <h3>Progresso</h3>
    <p>O progresso é a sua pontuação de 300: uma vitória em cada fase e cada modo com cada faxineiro (10 faxineiros × 10 fases × 2 modos = 200 pontos) mais os tesouros (20 × 5 pontos = 100 pontos). Vença todas as fases em todos os modos com todos os faxineiros e reúna todos os tesouros para chegar a 100%.</p>

    <h3>Chão sujo</h3>
    <p>O chão está sujo, e quanto mais sujo, mais devagar você anda. Por onde seu equipamento passa, o chão fica limpo. Num chão brilhando você anda mais rápido e recolhe poeira de mais longe. A sujeira se espalha aos poucos, e o lixo suja por onde passa. Enquanto está tudo muito sujo, uma névoa marrom cobre a tela; ela se dissipa conforme você limpa ao seu redor e a casa toda (dá para desligar nas configurações).</p>

    <h3>Caixa de poeira e pontos de coleta</h3>
    <p>A poeira recolhida vai para a lixeira (caixa de poeira) no canto inferior esquerdo. <b>Quando está cheia, o dano dos equipamentos cai pela metade, você não recolhe poeira (sem experiência) e fica mais lento.</b> A lixeira fica laranja aos 80% e pisca em vermelho quando enche, e uma seta aponta o ponto de coleta mais próximo. Fique em cima do <b>ponto de coleta verde que existe em cada cômodo</b> para esvaziá-la (você ganha moedas). Seus PV aparecem na barra embaixo do personagem.</p>

    <h3>Builds (espaços de equipamentos e passivas)</h3>
    <p>Há 11 tipos de equipamento de limpeza, mas numa partida você só pode levar <b>4 equipamentos e 4 passivas</b>. O esfregão varre ao seu redor, o espanador vai e volta, a bomba de detergente é jogada nos grupos de lixo, a esponja mágica quica nas paredes, o purificador de ar mantém o lixo próximo afastado, a prensa de poeira compacta a caixa numa onda de choque e assim por diante: sua combinação muda o seu jeito de lutar. O ideal é escolher um equipamento junto com a passiva que o faz evoluir. As telas de subir de nível e de baú mostram o que você tem (equipamentos em azul, passivas em roxo) e as receitas de evolução (equipamento + passiva → ícone evoluído). Ao entrar num cômodo, o nível de sujeira dele (★) aparece no alto da tela.</p>

    <h3>Evolução</h3>
    <p>Leve um equipamento de limpeza ao nível 8 e abra um baú tendo a passiva correspondente para fazê-lo evoluir. Os baús são deixados pelo lixo de borda dourada, pelos subchefes e pelos chefes.</p>
    <table>
      <tbody>
        <tr><th>Aspirador turbo + Bateria extra</th><td>Aspirador buraco negro</td></tr>
        <tr><th>Lavadora de alta pressão + Aquecedor de água</th><td>Canhão de vapor superaquecido</td></tr>
        <tr><th>Robô aspirador + Robô aspirador extra</th><td>Esquadrão de robôs</td></tr>
        <tr><th>Spray desinfetante + Água sanitária forte</th><td>Névoa de chuva ácida</td></tr>
        <tr><th>Rolo tira-pelos + Fita superadesiva</th><td>Rolo compressor gigante</td></tr>
        <tr><th>Esfregão + Luvas de borracha</th><td>Esfregão tornado</td></tr>
        <tr><th>Espanador + Botas de borracha</th><td>Espanador do deus do vento</td></tr>
        <tr><th>Bomba de detergente + Saco de poeira grande</th><td>Explosão de espuma</td></tr>
        <tr><th>Esponja mágica + Cera de chão</th><td>Chuva de esponjas</td></tr>
        <tr><th>Purificador de ar + Filtro HEPA</th><td>Barreira purificadora</td></tr>
        <tr><th>Prensa de poeira + Cilindro hidráulico</th><td>Megaprensa</td></tr>
      </tbody>
    </table>

    <h3>Controles no celular</h3>
    <table>
      <tbody>
        <tr><th>Tocar na tela e arrastar</th><td>Mover-se (onde você toca primeiro vira o centro do direcional)</td></tr>
        <tr><th>Ⅱ no canto superior direito</th><td>Pausa</td></tr>
      </tbody>
    </table>

    <h3>Controles no PC</h3>
    <table>
      <tbody>
        <tr><th>WASD / Setas</th><td>Mover-se</td></tr>
        <tr><th>P / Esc</th><td>Pausa (nos menus, Esc volta como o botão "‹ Voltar" no canto superior esquerdo)</td></tr>
        <tr><th>1–4</th><td>Escolher ao subir de nível</td></tr>
      </tbody>
    </table>
`,
};
