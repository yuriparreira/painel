// Catálogo de exercícios de musculação, com os nomes usados nas academias do Brasil, por grupo muscular. Entra na base
// de exercícios do app junto com os das fichas e os seus: serve para buscar um substituto ou montar um treino. Não tem
// séries nem cargas: as séries vêm da ficha (ou 3 × 8–12 num treino seu) e as cargas, do que você registrar.
const L = (s) => s.split('|').map((x) => x.trim()).filter(Boolean);
export const CATALOGO = {
  Peito: L(`Supino reto com barra|Supino reto com halteres|Supino reto na máquina|Supino reto no Smith|Supino inclinado com barra|
    Supino inclinado com halteres|Supino inclinado na máquina|Supino inclinado no Smith|Supino declinado com barra|Supino declinado com halteres|
    Supino com pegada fechada|Supino articulado|Crucifixo reto com halteres|Crucifixo inclinado com halteres|Crucifixo declinado com halteres|
    Crucifixo na máquina (peck deck)|Crossover polia alta|Crossover polia média|Crossover polia baixa|Fly no cabo inclinado|
    Pullover com halter|Pullover na polia|Flexão de braço|Flexão de braço inclinada|Flexão de braço declinada|Flexão diamante|
    Flexão com carga|Paralelas para peito|Chest press sentado|Svend press`),
  Costas: L(`Barra fixa pronada|Barra fixa supinada|Barra fixa neutra|Barra fixa assistida (graviton)|Puxada frontal aberta|
    Puxada frontal fechada|Puxada com triângulo|Puxada supinada|Puxada unilateral na polia|Puxada na máquina articulada|Pulldown com braços estendidos|
    Remada curvada com barra|Remada curvada supinada|Remada Pendlay|Remada unilateral com halter (serrote)|Remada cavalinho (T-bar)|
    Remada baixa no cabo|Remada baixa com triângulo|Remada aberta no cabo|Remada sentada na máquina|Remada articulada|Remada no Smith|
    Remada apoiada no banco inclinado|Remada invertida|Remada com halteres no banco (seal row)|Levantamento terra|Levantamento terra sumô|
    Levantamento terra com trap bar|Rack pull|Encolhimento com barra|Encolhimento com halteres|Encolhimento na máquina|Face pull`),
  Ombros: L(`Desenvolvimento com barra|Desenvolvimento militar em pé|Desenvolvimento com halteres|Desenvolvimento na máquina|
    Desenvolvimento no Smith|Desenvolvimento Arnold|Push press|Landmine press|Elevação lateral com halteres|Elevação lateral na polia|
    Elevação lateral na máquina|Elevação lateral sentado|Elevação lateral inclinada|Elevação frontal com halteres|Elevação frontal com barra|
    Elevação frontal com anilha|Elevação frontal na polia|Crucifixo invertido com halteres|Crucifixo invertido na máquina|
    Crucifixo invertido na polia|Remada alta com barra|Remada alta na polia|Rotação externa na polia|Rotação interna na polia|
    Rotação externa com halter|Y-raise no banco inclinado|Pike push-up|Flexão em pé na parede (handstand push-up)`),
  Bíceps: L(`Rosca direta com barra|Rosca direta com barra W|Rosca direta com halteres|Rosca alternada|Rosca martelo|Rosca martelo na corda|
    Rosca concentrada|Rosca Scott com barra|Rosca Scott com halter|Rosca Scott na máquina|Rosca inclinada com halteres|Rosca spider|
    Rosca na polia baixa|Rosca bayesian na polia|Rosca 21|Rosca inversa|Rosca Zottman|Rosca drag|Rosca na máquina`),
  Tríceps: L(`Tríceps pulley com barra|Tríceps corda|Tríceps pulley inverso|Tríceps testa com barra|Tríceps testa com halteres|
    Tríceps francês com halter|Tríceps francês na polia|Tríceps coice com halter|Tríceps coice na polia|Tríceps unilateral na polia|
    Tríceps na máquina|Tríceps banco (mergulho no banco)|Paralelas para tríceps|Extensão de tríceps acima da cabeça na corda|JM press`),
  Antebraço: L(`Rosca de punho|Rosca de punho inversa|Rolo de punho|Caminhada do fazendeiro|Pegada estática na barra (dead hang)|Pinça com anilhas`),
  Quadríceps: L(`Agachamento livre|Agachamento frontal|Agachamento no Smith|Agachamento goblet|Agachamento hack|Agachamento sumô|
    Agachamento búlgaro|Agachamento com salto|Agachamento na caixa|Agachamento pistol|Agachamento sissy|Leg press 45°|Leg press horizontal|
    Leg press unilateral|Cadeira extensora|Cadeira extensora unilateral|Afundo com halteres|Afundo com barra|Afundo andando|Passada reversa|
    Avanço no Smith|Subida no banco (step-up)|Belt squat|Pêndulo (pendulum squat)|Agachamento na parede (isometria)`),
  Posteriores: L(`Mesa flexora|Cadeira flexora|Flexora em pé unilateral|Stiff com barra|Stiff com halteres|Stiff unilateral|
    Levantamento terra romeno|Bom-dia com barra|Flexão nórdica|Flexão de joelho na bola|Good morning sentado|Glute-ham raise`),
  Glúteos: L(`Elevação pélvica com barra (hip thrust)|Elevação pélvica na máquina|Elevação pélvica unilateral|Ponte de glúteo|
    Ponte de glúteo unilateral|Glúteo na polia (coice)|Glúteo quatro apoios|Abdução de quadril na máquina|Abdução de quadril na polia|
    Abdução com elástico|Adução de quadril na máquina|Adução na polia|Extensão de quadril na máquina|Kickback na máquina|Frog pump|
    Agachamento lateral (cossaco)|Passada cruzada (curtsy)|Coice com caneleira`),
  Panturrilha: L(`Panturrilha em pé na máquina|Panturrilha sentado|Panturrilha no leg press|Panturrilha no Smith|Panturrilha unilateral com halter|
    Panturrilha no degrau|Burrinho (donkey calf raise)|Tibial anterior (elevação de ponta de pé)`),
  'Abdômen e core': L(`Prancha|Prancha lateral|Prancha com toque no ombro|Abdominal supra|Abdominal infra|Abdominal remador|Abdominal bicicleta|
    Abdominal na polia (crunch ajoelhado)|Abdominal na máquina|Abdominal declinado|Elevação de pernas na barra|Elevação de joelhos na barra|
    Elevação de pernas no banco|Elevação de pernas nas paralelas (captain's chair)|Roda abdominal|Dead bug|Bird dog|Hollow hold|
    Russian twist|Pallof press|Lenhador na polia (woodchopper)|Canivete (V-up)|Mountain climber|Farmer carry unilateral (mala)`),
  Lombar: L(`Hiperextensão lombar (banco romano)|Extensão lombar na máquina|Superman|Hiperextensão reversa|Prancha dorsal`),
  'Corpo inteiro': L(`Burpee|Kettlebell swing|Arranco com kettlebell|Clean com barra (power clean)|Arremesso (clean and jerk)|
    Arranco com barra (snatch)|Thruster|Wall ball|Turkish get-up|Sled push (trenó)|Sled pull|Battle rope|Corda naval alternada|
    Lançamento de medicine ball|Slam ball|Box jump|Pular corda|Remo ergômetro|Bicicleta de ar (air bike)|Sprint na esteira`),
  Mobilidade: L(`Mobilidade de quadril (90/90)|Mobilidade de tornozelo|Mobilidade torácica|Gato-camelo|Alongamento de flexores do quadril|
    Alongamento de posteriores|Alongamento de peitoral|Rotação de ombro com bastão|Agachamento profundo segurando (goblet hold)|
    Liberação miofascial com rolo|Deslocamento de ombro com elástico|Ponte de glúteo com isometria`),
};
export const GRUPOS = Object.keys(CATALOGO);
