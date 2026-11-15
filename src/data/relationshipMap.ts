import type {
  PositionedRelationshipNode,
  RelationshipMapData,
} from '../types/novel';

export const relationshipMapData: RelationshipMapData = {
  nodes: [
    {
      id: 'ariel',
      name: 'Ariel',
      role: 'Tokoh Utama',
      group: 'main',
      desc: 'Tenang dan hati-hati dengan kata-kata, tapi penuh perhatian lewat tindakan kecil. Tumbuh besar bersama Alie sejak TK, dan baru benar-benar menyadari perasaannya sendiri menjelang akhir SMA.',
    },
    {
      id: 'alie',
      name: 'Alie',
      role: 'Tokoh Utama',
      group: 'main',
      desc: 'Tampak cuek dan irit kata, tapi diam-diam posesif dan sangat memperhatikan Ariel. Anak Tionghoa-Kristen yang dekat dengan keluarganya, terutama Oma Lien.',
    },
    {
      id: 'nabila',
      name: 'Nabila',
      role: 'Teman sekelas Ariel',
      group: 'support',
      desc: 'Siswi XI-IPS-1 yang ramah dan belakangan sering mendekati Ariel dengan berbagai alasan kecil. Kehadirannya jadi sumber kecemburuan halus yang tak pernah diakui Alie secara langsung.',
    },
    {
      id: 'kevin',
      name: 'Kevin',
      role: 'Teman SMP Alie',
      group: 'support',
      desc: 'Pernah menyatakan suka secara terang-terangan kepada Alie semasa SMP kelas delapan. Ditolak, tapi tanpa sadar membuat Ariel lebih awal menyadari perasaannya sendiri.',
    },
    {
      id: 'elyn',
      name: 'Elyn',
      role: 'Sahabat Alie di sekolah',
      group: 'support',
      desc: 'Teman sekelas Alie sejak kelas tujuh — riang dan cepat bicara, kebalikan dari Alie yang tenang. Menyimpan banyak cerita tentang Alie yang tak pernah diceritakan langsung ke Ariel.',
    },
    {
      id: 'faza',
      name: 'Faza',
      role: 'Teman Alie, jago matematika',
      group: 'support',
      desc: 'Teman Alie yang biasanya fokus pada angka-angka, tapi ternyata cukup peka soal dinamika sosial di sekitarnya — termasuk soal Ariel.',
    },
    {
      id: 'reno',
      name: 'Reno',
      role: 'Teman TK-B',
      group: 'support',
      desc: 'Anak laki-laki ceroboh di kelas TK-B yang dulu mengumumkan ingin menikahi Alie kelak. Rival kecil paling awal dalam hidup Ariel, walau tak pernah dianggap serius.',
    },
    {
      id: 'omalien',
      name: 'Oma Lien',
      role: 'Nenek Alie',
      group: 'family',
      desc: 'Nenek dari pihak Alie — tenang dan jarang banyak bicara, tapi caranya yang diam justru mengajarkan banyak hal kecil kepada Ariel.',
    },
    {
      id: 'ibuariel',
      name: 'Ibu Ariel',
      role: 'Orang tua Ariel',
      group: 'family',
      desc: 'Bersahabat dengan ibu Alie sejak SMP — persahabatan itulah alasan utama Ariel dan Alie bisa bertemu sejak TK.',
    },
    {
      id: 'ibualie',
      name: 'Ibu Alie',
      role: 'Orang tua Alie',
      group: 'family',
      desc: 'Sahabat lama ibu Ariel, selalu menyambut hangat Ariel di rumahnya layaknya anak sendiri.',
    },
    {
      id: 'ayahalie',
      name: 'Ayah Alie',
      role: 'Orang tua Alie',
      group: 'family',
      desc: 'Budi — pendiam tapi hangat, sering mengajak Ariel main futsal atau badminton tanpa banyak basa-basi.',
    },
  ],
  edges: [
    {
      from: 'ariel',
      to: 'alie',
      label: 'Sahabat sejak TK, tumbuh jadi cinta yang belum diberi nama',
      main: true,
    },
    {
      from: 'ariel',
      to: 'nabila',
      label: 'Nabila mendekati Ariel — sumber kecemburuan halus Alie',
    },
    {
      from: 'alie',
      to: 'kevin',
      label: 'Kevin pernah menyatakan suka ke Alie semasa SMP',
    },
    {
      from: 'alie',
      to: 'elyn',
      label: 'Sahabat dekat Alie di sekolah sejak kelas tujuh',
    },
    {
      from: 'alie',
      to: 'faza',
      label: 'Teman sekelas Alie yang diam-diam memperhatikan',
    },
    {
      from: 'ariel',
      to: 'reno',
      label: 'Rival kecil masa TK yang mengaku ingin menikahi Alie',
    },
    {
      from: 'alie',
      to: 'omalien',
      label: 'Cucu yang dekat dengan caranya sendiri',
    },
    {
      from: 'ariel',
      to: 'ibuariel',
      label: 'Anak dan ibu',
    },
    {
      from: 'alie',
      to: 'ibualie',
      label: 'Anak dan ibu',
    },
    {
      from: 'alie',
      to: 'ayahalie',
      label: 'Anak dan ayah',
    },
    {
      from: 'ibuariel',
      to: 'ibualie',
      label: 'Sahabat sejak SMP — alasan Ariel & Alie bertemu sejak TK',
    },
  ],
};

export interface RelationshipLayoutResult {
  width: number;
  height: number;
  nodes: PositionedRelationshipNode[];
}

export function computeRelationshipLayout(
  data: RelationshipMapData = relationshipMapData,
): RelationshipLayoutResult {
  const width = 360;
  const height = 460;

  const supportNodes = data.nodes.filter(
    (n) => n.id !== 'ariel' && n.id !== 'alie',
  );
  const centerX = width / 2;
  const centerY = 280;
  const radius = 150;

  let supportIdx = 0;
  const positioned: PositionedRelationshipNode[] = data.nodes.map((node) => {
    if (node.id === 'ariel') {
      return { ...node, x: width / 2 - 42, y: 70 };
    }
    if (node.id === 'alie') {
      return { ...node, x: width / 2 + 42, y: 70 };
    }
    const angle =
      -Math.PI / 2 + (supportIdx / supportNodes.length) * Math.PI * 2;
    supportIdx += 1;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  return { width, height, nodes: positioned };
}
