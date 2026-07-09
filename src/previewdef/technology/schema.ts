import { Node, Token } from "../../hoiformat/hoiparser";
import { HOIPartial, Position, CustomMap, Enum, SchemaDef, positionSchema, convertNodeToJson, Raw } from "../../hoiformat/schema";
import { arrayToMap } from "../../util/common";
import { ConditionComplexExpr, ConditionItem, extractConditionValues, extractConditionalExprs } from "../../hoiformat/condition";
import { countryScope } from "../../hoiformat/scope";
import { GridBoxType } from "../../hoiformat/gui";
import { ParentInfo } from "../../util/hoi4gui/common";

export interface RenderedTechnologyFolder {
    template: string; // html
    gridboxes: Record<string, RenderedTechnologyFolderGridBox>; // start tech id -> gridbox
    renderedTechnologies: Record<string, string>; // tech id -> rendered html
    renderedXor: { upDown: string; leftRight: string };
    renderedLines: string[]; // (item.up ? 1 : 0) | (item.right ? 2 : 0) | (item.down ? 4 : 0) | (item.left ? 8 : 0) | (dot ? 16 : 0)
}

export interface RenderedTechnologyFolderGridBox {
    gridbox: HOIPartial<GridBoxType>;
    parentInfo: ParentInfo;
    background: string;
}

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
    inAllowBranch: string[];
    allowBranch: ConditionComplexExpr | undefined;
    startYear: number;
    enableEquipments: boolean;
    forceUseSmallTechLayout: boolean;
    subTechnologies: Technology[];
    token: Token | undefined;
}

export interface TechnologyTree {
    startTechnology: string;
    folder: string;
    conditionExprs: ConditionItem[];
    technologies: Technology[];
}

type TechnologiesDef = CustomMap<TechnologyDef>;

interface TechnologyDef {
    enable_equipments: Enum;
    force_use_small_tech_layout: boolean;
    allow_branch: Raw[];
    path: TechnologyPath[];
    folder: Folder[];
    start_year: number;
    xor: Enum;
    sub_technologies: Enum;
    _token: Token;
}

interface TechnologyPath {
    leads_to_tech: string;
}

interface Folder {
    name: string;
    position: Position;
}

interface TechnologyFile {
    technologies: TechnologiesDef;
}

const technologySchema: SchemaDef<TechnologyDef> = {
    enable_equipments: "enum",
    force_use_small_tech_layout: "boolean",
    allow_branch: {
        _innerType: "raw",
        _type: "array",
    },
    path: {
        _innerType: {
            leads_to_tech: "string",
        },
        _type: "array",
    },
    folder: {
        _innerType: {
            name: "string",
            position: positionSchema,
        },
        _type: "array",
    },
    start_year: "number",
    xor: "enum",
    sub_technologies: "enum",
};

const technologiesSchema: SchemaDef<TechnologiesDef> = {
    _innerType: technologySchema,
    _type: "map",
};

const technologyFileSchema: SchemaDef<TechnologyFile> = {
    technologies: technologiesSchema,
};

export function getTechnologyTrees(node: Node): TechnologyTree[] {
    const file = convertNodeToJson<TechnologyFile>(node, technologyFileSchema);
    const allTechnologies = getTechnologies(file.technologies._map);

    const result: TechnologyTree[] = [];
    const technologiesByFolder = getTechnologiesByFolder(allTechnologies);
    for (const [folder, techs] of Object.entries(technologiesByFolder)) {
        const trees = getTechnologiesByTree(techs);
        for (const [startTechnology, techs2] of Object.entries(trees)) {
            const conditionExprs: ConditionItem[] = [];
            for (const technology of techs2) {
                if (technology.allowBranch !== undefined) {
                    extractConditionalExprs(technology.allowBranch, conditionExprs);
                }
            }

            result.push({
                startTechnology: startTechnology,
                conditionExprs,
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
    const techIdToTech: Record<string, Technology> = arrayToMap(technologiesInOneFolder, 'id');
    const trees: Record<string, Technology[]> = {};
    const treeRootMap: Record<string, string> = {};

    for (const technology of technologiesInOneFolder) {
        const treeRoot = treeRootMap[technology.id] ?? technology.id;
        const tree = trees[treeRoot] ?? [];

        tree.push(technology);
        for (const child of technology.leadsToTechs) {
            // the node is already in another tree
            if (treeRootMap[child] && treeRootMap[child] !== treeRoot) {
                continue;
            }

            if (!techIdToTech[child]) {
                continue;
            }

            treeRootMap[child] = treeRoot;
            tree.push(techIdToTech[child]);

            const childTree = trees[child];
            if (childTree) {
                for (const childTech of childTree) {
                    treeRootMap[childTech.id] = treeRoot;
                    tree.push(childTech);
                }
                delete trees[child];
            }
        }

        trees[treeRoot] = tree;
    }

    for (const rootTechId in trees) {
        trees[rootTechId].push(techIdToTech[rootTechId]);
    }

    return trees;
}

function getTechnologies(technologies: HOIPartial<TechnologiesDef>['_map']): Record<string, Technology> {
    const result: Record<string, Technology> = {};

    for (const { _key, _value } of Object.values(technologies)) {
        const id = _key;
        const technology = _value;
        const token = technology._token;
        const startYear = technology.start_year ?? 0;
        const leadsToTechs = technology.path.map(p => p.leads_to_tech).filter((p): p is string => p !== undefined);
        const xor = technology.xor._values;
        const hasAllowBranch = technology.allow_branch.length > 0;
        const allowBranch = hasAllowBranch ?
            extractConditionValues(technology.allow_branch.filter((v): v is Raw => v !== undefined).map(v => v._raw.value), countryScope).condition :
            undefined;
        const enableEquipments = technology.enable_equipments._values.length > 0;
        const forceUseSmallTechLayout = technology.force_use_small_tech_layout ?? false;
        const folders: Record<string, TechnologyFolder> = {};
        
        for (const folder of technology.folder) {
            const x = folder.position?.x?._value ?? 0;
            const y = folder.position?.y?._value ?? 0;

            const folderName = folder.name;
            if (folderName) {
                folders[folderName] = { name: folderName, x, y };
            }
        }

        result[id] = {
            id, token, startYear, leadsToTechs, xor, inAllowBranch: hasAllowBranch ? [id] : [], allowBranch, enableEquipments, folders,
            subTechnologies: [],
            forceUseSmallTechLayout,
        };
    }

    let hasChangedInAllowBranch = true;
    while (hasChangedInAllowBranch) {
        hasChangedInAllowBranch = false;
        for (const technology of Object.values(result)) {
            if (technology.inAllowBranch.length === 0) {
                continue;
            }

            for (const childTechName of technology.leadsToTechs) {
                const childTechnology = result[childTechName];
                if (!childTechnology) {
                    continue;
                }

                for (const branchRoot of technology.inAllowBranch) {
                    if (!childTechnology.inAllowBranch.includes(branchRoot)) {
                        childTechnology.inAllowBranch.push(branchRoot);
                        hasChangedInAllowBranch = true;
                    }
                }
            }
        }
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
