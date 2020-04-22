import { Node, Token } from "./hoiparser";
import { convertNodeFromFileToJson, HOIPartial, Technologies } from "./schema";

export interface TechnologyFolder {
    name: string;
    x: number;
    y: number;
}

export interface Technology {
    id: string;
    folders: Record<string, TechnologyFolder>;
    leadsToTechs: string[];
    xor: string[];
    startYear: number;
    enableEquipments: boolean;
    subTechnologies: Technology[];
    token: Token | undefined;
}

export interface TechnologyTree {
    startTechnology: string;
    folder: string;
    technologies: Technology[];
}

export function getTechnologyTrees(node: Node): TechnologyTree[] {
    const file = convertNodeFromFileToJson(node);
    const allTechnologies = getTechnologies(file.technologies._map);

    const result: TechnologyTree[] = [];
    const technologiesByFolder = getTechnologiesByFolder(allTechnologies);
    for (const [folder, techs] of Object.entries(technologiesByFolder)) {
        const trees = getTechnologiesByTree(techs);
        for (const [startTechnology, techs2] of Object.entries(trees)) {
            result.push({
                startTechnology: startTechnology,
                technologies: techs2,
                folder,
            });
        }
    }

    return result;
}

function getTechnologiesByFolder(allTechnologies: Record<string, Technology>): Record<string, Technology[]> {
    const groupedTechnologies: Record<string, Technology[]> = {};
    for (const tech of Object.values(allTechnologies)) {
        for (const folder in tech.folders) {
            if (folder !== undefined && !(folder in groupedTechnologies)) {
                groupedTechnologies[folder] = [];
            }

            groupedTechnologies[folder].push(tech);
        }
    }

    return groupedTechnologies;
}

function getTechnologiesByTree(technologiesInOneFolder: Technology[]): Record<string, Technology[]> {
    const trees: Record<string, Technology[]> = {};
    const ancestorMap: Record<string, string> = {};

    // TODO one node have two ancestors
    for (const technology of technologiesInOneFolder) {
        const ancestor = ancestorMap[technology.id] || technology.id;
        const theTree = trees[ancestor] || [];

        theTree.push(technology);
        for (const child of technology.leadsToTechs) {
            const childTree = trees[child];
            if (childTree) {
                theTree.push(...childTree);
                delete trees[child];
            } else {
                ancestorMap[child] = ancestor;
            }
        }

        trees[ancestor] = theTree;
    }

    return trees;
}

function getTechnologies(technologies: HOIPartial<Technologies>['_map']): Record<string, Technology> {
    const result: Record<string, Technology> = {};

    for (const { _key, _value } of Object.values(technologies)) {
        const id = _key;
        const technology = _value;
        const token = technology._token;
        const startYear = technology.start_year ?? 0;
        const leadsToTechs = technology.path.map(p => p.leads_to_tech?._name).filter((p): p is string => p !== undefined);
        const xor = technology.xor._values;
        const enableEquipments = technology.enable_equipments._values.length > 0;
        const folders: Record<string, TechnologyFolder> = {};
        
        for (const folder of technology.folder) {
            const x = folder.position?.x?._value ?? 0;
            const y = folder.position?.y?._value ?? 0;

            const folderName = folder.name?._name;
            if (folderName) {
                folders[folderName] = { name: folderName, x, y };
            }
        }

        result[id] = {
            id, token, startYear, leadsToTechs, xor, enableEquipments, folders,
            subTechnologies: [],
        };
    }

    for (const { _key, _value } of Object.values(technologies)) {
        const id = _key;
        const technology = _value;
        const techObject = result[id];

        for (const subTechnologyName of technology.sub_technologies._values) {
            const subTechnology = result[subTechnologyName];
            if (subTechnology) {
                techObject.subTechnologies.push(subTechnology);
            }
        }
    }

    return result;
}
