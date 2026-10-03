export async function loadLaborerData() {
    const read = async (file) => {
        const response = await fetch(`data/${file}.json`);
        if (!response.ok) throw new Error(`Laborer verisi yüklenemedi (${response.status})`);
        return response.json();
    };
    const [catalog, mechanics, acquisition] = await Promise.all([read('laborer-contract'), read('laborer-progression-rules'), read('laborer-acquisition')]);
    return { ...catalog, mechanics, acquisition };
}

export function laborerTypes(data) {
    return [...new Set(data.contracts.map((row) => row.type))].map((type) => ({
        type, contracts: data.contracts.filter((row) => row.type === type).sort((a, b) => a.tier - b.tier),
        // Category follows journal mission data; do not maintain another labourer list.
        journals: data.journals.filter((row) => row.type === type),
        category: data.journals.find((row) => row.type === type)?.missionTypes?.join(', ') || 'unknown'
    }));
}

export function mechanicIssues(mechanics) {
    if (!mechanics?.verified || !mechanics.source) return mechanics?.reasons?.length ? mechanics.reasons : ['Doğrulanmış laborer mekanik verisi yok.'];
    if (!(mechanics.cycleHours > 0) || typeof mechanics.carryOver !== 'boolean' || !mechanics.stages) return ['Mekanik veri eksik.'];
    return [];
}
