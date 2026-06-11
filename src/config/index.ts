export type DeepReadonly<T> = T extends (...args: readonly unknown[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

const deepFreeze = <const T>(value: T): DeepReadonly<T> => {
  if (value !== null && typeof value === "object") {
    const objectValue = value as Record<PropertyKey, unknown>;

    for (const key of Reflect.ownKeys(objectValue)) {
      deepFreeze(objectValue[key]);
    }

    Object.freeze(objectValue);
  }

  return value as DeepReadonly<T>;
};

export const config = deepFreeze({
  runStructure: {
    depthFloors: 12, // GAME_DESIGN §2
    depthBands: {
      shallows: {
        minFloor: 1, // GAME_DESIGN §2
        maxFloor: 4 // GAME_DESIGN §2
      },
      middle: {
        minFloor: 5, // GAME_DESIGN §2
        maxFloor: 9 // GAME_DESIGN §2
      },
      lowest: {
        minFloor: 10, // GAME_DESIGN §2
        maxFloor: 12 // GAME_DESIGN §2
      }
    },
    terminalStates: {
      win: "WIN", // GAME_DESIGN §2
      loss: "LOSS", // GAME_DESIGN §2
      abort: "ABORTED" // GAME_DESIGN §2
    },
    perFloorSoftCapTurns: 800, // GAME_DESIGN §2
    reinforcementIntervalTurns: 100, // GAME_DESIGN §2
    floorGeometry: {
      shallows: {
        grid: {
          width: 32, // GAME_DESIGN §2
          height: 20 // GAME_DESIGN §2
        },
        rooms: {
          min: 4, // GAME_DESIGN §2
          max: 7 // GAME_DESIGN §2
        },
        layoutFlavors: [
          "open", // GAME_DESIGN §2
          "warren" // GAME_DESIGN §2
        ]
      },
      middle: {
        grid: {
          width: 40, // GAME_DESIGN §2
          height: 24 // GAME_DESIGN §2
        },
        rooms: {
          min: 5, // GAME_DESIGN §2
          max: 9 // GAME_DESIGN §2
        },
        layoutFlavors: [
          "open", // GAME_DESIGN §2
          "warren", // GAME_DESIGN §2
          "halls", // GAME_DESIGN §2
          "ring" // GAME_DESIGN §2
        ]
      },
      lowest: {
        grid: {
          width: 36, // GAME_DESIGN §2
          height: 22 // GAME_DESIGN §2
        },
        rooms: {
          min: 3, // GAME_DESIGN §2
          max: 6 // GAME_DESIGN §2
        },
        layoutFlavors: [
          "halls", // GAME_DESIGN §2
          "ring", // GAME_DESIGN §2
          "sanctum" // GAME_DESIGN §2
        ]
      }
    }
  },
  playerCharacter: {
    stats: {
      hp: {
        start: 20, // GAME_DESIGN §4
        growthPerLevel: 4 // GAME_DESIGN §4
      },
      level: {
        start: 1, // GAME_DESIGN §4
        xpThresholdPolicy: "steadyKillsPerLevel" // GAME_DESIGN §4
      },
      baseAttack: {
        start: 2, // GAME_DESIGN §4
        growthAmount: 1, // GAME_DESIGN §4
        growthEveryLevels: 2 // GAME_DESIGN §4
      },
      baseDefense: {
        start: 0, // GAME_DESIGN §4
        growthAmount: 1, // GAME_DESIGN §4
        growthEveryLevels: 3 // GAME_DESIGN §4
      },
      fullness: {
        start: 100, // GAME_DESIGN §4
        decay: {
          amount: 1, // GAME_DESIGN §4
          everyTurns: 10 // GAME_DESIGN §4
        },
        starvationDamage: {
          hpLoss: 1, // GAME_DESIGN §4
          everyTurns: 2 // GAME_DESIGN §4
        }
      }
    },
    naturalRegen: {
      hpGain: 1, // GAME_DESIGN §4
      everyTurns: 6, // GAME_DESIGN §4
      requiresFullnessAbove: 0 // GAME_DESIGN §4
    },
    inventory: {
      slots: 16, // GAME_DESIGN §4
      identicalConsumableStackLimit: 5 // GAME_DESIGN §4
    },
    equipmentSlots: {
      weapon: 1, // GAME_DESIGN §4
      armor: 1, // GAME_DESIGN §4
      charms: 2 // GAME_DESIGN §4
    },
    xpToNextLevelFactor: 8 // GAME_DESIGN §4
  },
  combatMath: {
    minimumDamage: 1, // GAME_DESIGN §5
    hitChancePercent: 95, // GAME_DESIGN §5
    varianceMultiplier: {
      min: 0.85, // GAME_DESIGN §5
      max: 1.15 // GAME_DESIGN §5
    }
  },
  statusMagnitudes: {
    poisonHpPerTurn: -1, // GAME_DESIGN §6
    burnHpPerTurn: -2, // GAME_DESIGN §6
    regenHpPerTurn: 2, // GAME_DESIGN §6
    shieldDefBonus: 3, // GAME_DESIGN §6
    weakenAtkPenalty: -2 // GAME_DESIGN §6
  },
  itemsEconomy: {
    valueBandsCoin: {
      shallows: {
        min: 5, // GAME_DESIGN §8
        max: 30 // GAME_DESIGN §8
      },
      middle: {
        min: 20, // GAME_DESIGN §8
        max: 80 // GAME_DESIGN §8
      },
      lowest: {
        min: 60, // GAME_DESIGN §8
        max: 200 // GAME_DESIGN §8
      }
    },
    itemsPerFloor: {
      min: 4, // GAME_DESIGN §8
      max: 8 // GAME_DESIGN §8
    },
    merchantMultipliers: {
      buy: 0.5, // GAME_DESIGN §8
      sell: {
        min: 1, // GAME_DESIGN §8
        max: 1.5 // GAME_DESIGN §8
      }
    },
    cursedRate: 0.10, // GAME_DESIGN §8
    cursedGearChanceMaxPercent: 10, // GAME_DESIGN §8
    questRewardValueMultiplier: {
      min: 1.5, // GAME_DESIGN §8
      max: 3 // GAME_DESIGN §8
    }
  },
  enemyDesign: {
    spawnBudgetPoints: {
      shallows: 20, // GAME_DESIGN §9.1
      middle: 45, // GAME_DESIGN §9.1
      lowest: 70 // GAME_DESIGN §9.1
    },
    costWeights: {
      stats: {
        baseByBand: {
          shallows: 1, // GAME_DESIGN §9.1 [T]
          middle: 4, // GAME_DESIGN §9.1 [T]
          lowest: 8 // GAME_DESIGN §9.1 [T]
        },
        hpDeltaDivisor: 2, // GAME_DESIGN §9.1 [T]
        attackDelta: 2, // GAME_DESIGN §9.1 [T]
        defenseDelta: 3 // GAME_DESIGN §9.1 [T]
      },
      behaviors: {
        approach_melee: 1, // GAME_DESIGN §9.2 [T]
        keep_range: 2, // GAME_DESIGN §9.2 [T]
        flee_low_hp: 2, // GAME_DESIGN §9.2 [T]
        pack_hunter: 3, // GAME_DESIGN §9.2 [T]
        ambusher: 3, // GAME_DESIGN §9.2 [T]
        territorial: 2, // GAME_DESIGN §9.2 [T]
        guard: 2, // GAME_DESIGN §9.2 [T]
        patrol: 2, // GAME_DESIGN §9.2 [T]
        thief: 4, // GAME_DESIGN §9.2 [T]
        caster: 4, // GAME_DESIGN §9.2 [T]
        bodyguard: 4, // GAME_DESIGN §9.2 [T]
        mimic: 5 // GAME_DESIGN §9.2 [T]
      },
      effects: {
        verbs: {
          damage: 1, // GAME_DESIGN §7, §9.1 [T]
          heal: 1, // GAME_DESIGN §7, §9.1 [T]
          apply_status: 2, // GAME_DESIGN §7, §9.1 [T]
          cure_status: 1, // GAME_DESIGN §7, §9.1 [T]
          buff_stat: 2, // GAME_DESIGN §7, §9.1 [T]
          nutrition: 1, // GAME_DESIGN §7, §9.1 [T]
          teleport_self: 3, // GAME_DESIGN §7, §9.1 [T]
          teleport_target: 4, // GAME_DESIGN §7, §9.1 [T]
          blink: 2, // GAME_DESIGN §7, §9.1 [T]
          knockback: 2, // GAME_DESIGN §7, §9.1 [T]
          reveal: 1, // GAME_DESIGN §7, §9.1 [T]
          identify: 1, // GAME_DESIGN §7, §9.1 [T]
          enchant: 2, // GAME_DESIGN §7, §9.1 [T]
          summon: 3, // GAME_DESIGN §7, §9.1 [T]
          transform: 3, // GAME_DESIGN §7, §9.1 [T]
          dig: 2 // GAME_DESIGN §7, §9.1 [T]
        },
        magnitudeDivisors: {
          damageAmount: 2, // GAME_DESIGN §7, §9.1 [T]
          healAmount: 4, // GAME_DESIGN §7, §9.1 [T]
          statusDuration: 3, // GAME_DESIGN §7, §9.1 [T]
          buffMagnitudeDurationProduct: 8, // GAME_DESIGN §7, §9.1 [T]
          nutritionFullness: 25, // GAME_DESIGN §7, §9.1 [T]
          blinkDistanceTiles: 2, // GAME_DESIGN §7, §9.1 [T]
          knockbackPushTiles: 1, // GAME_DESIGN §7, §9.1 [T]
          knockbackCollisionDamage: 1, // GAME_DESIGN §7, §9.1 [T]
          summonCount: 1, // GAME_DESIGN §7, §9.1 [T]
          digLengthTiles: 2, // GAME_DESIGN §7, §9.1 [T]
          boltRangeTiles: 4, // GAME_DESIGN §7, §9.1 [T]
          burstRadiusTiles: 1, // GAME_DESIGN §7, §9.1 [T]
          procChancePercent: 10, // GAME_DESIGN §7, §9.1 [T]
          useCharges: 2 // GAME_DESIGN §7, §9.1 [T]
        },
        targeting: {
          self: 0, // GAME_DESIGN §7, §9.1 [T]
          melee: 0, // GAME_DESIGN §7, §9.1 [T]
          bolt: 1, // GAME_DESIGN §7, §9.1 [T]
          burst: 2, // GAME_DESIGN §7, §9.1 [T]
          floor: 2 // GAME_DESIGN §7, §9.1 [T]
        },
        trigger: {
          quaff: 0, // GAME_DESIGN §7, §9.1 [T]
          read: 0, // GAME_DESIGN §7, §9.1 [T]
          throw_hit: 1, // GAME_DESIGN §7, §9.1 [T]
          equip_passive: 2, // GAME_DESIGN §7, §9.1 [T]
          on_hit: 1, // GAME_DESIGN §7, §9.1 [T]
          on_struck: 1, // GAME_DESIGN §7, §9.1 [T]
          step: 1, // GAME_DESIGN §7, §9.1 [T]
          use: 1 // GAME_DESIGN §7, §9.1 [T]
        }
      },
      xpYieldByCost: {
        shallows: {
          pointsPerXp: 4, // GAME_DESIGN §9.1 [T]
          offset: 1 // GAME_DESIGN §9.1 [T]
        },
        middle: {
          pointsPerXp: 3, // GAME_DESIGN §9.1 [T]
          offset: 1 // GAME_DESIGN §9.1 [T]
        },
        lowest: {
          pointsPerXp: 3, // GAME_DESIGN §9.1 [T]
          offset: 3 // GAME_DESIGN §9.1 [T]
        }
      }
    }
  },
  trapsNpcsQuests: {
    quests: {
      maxPerRun: 3 // GAME_DESIGN §10
    }
  },
  difficultyGate: {
    botEnsemble: {
      policies: [
        "cautious", // GAME_DESIGN §11
        "balanced", // GAME_DESIGN §11
        "aggressive" // GAME_DESIGN §11
      ],
      seedsPerPolicy: 5 // GAME_DESIGN §11
    },
    thresholdsByBand: {
      shallows: {
        clearRateMinPercent: 95, // GAME_DESIGN §11
        medianHpRetentionPercent: {
          min: 55, // GAME_DESIGN §11
          max: 90 // GAME_DESIGN §11
        },
        hardRejects: {
          anyBotDeathThroughFloor: 2 // GAME_DESIGN §11
        }
      },
      middle: {
        clearRateMinPercent: 85, // GAME_DESIGN §11
        medianHpRetentionPercent: {
          min: 30, // GAME_DESIGN §11
          max: 75 // GAME_DESIGN §11
        },
        hardRejects: {
          clearRateBelowPercent: 60 // GAME_DESIGN §11
        }
      },
      lowest: {
        clearRateMinPercent: 70, // GAME_DESIGN §11
        medianHpRetentionPercent: {
          min: 15, // GAME_DESIGN §11
          max: 60 // GAME_DESIGN §11
        },
        hardRejects: {
          clearRateBelowPercent: 40 // GAME_DESIGN §11
        }
      }
    }
  },
  directorManifest: {
    narrationBeats: {
      floorIntroLines: 1, // GAME_DESIGN §12
      triggeredObservationLinesMax: 3 // GAME_DESIGN §12
    },
    signatureMoment: {
      budgetRelaxPercent: 25 // GAME_DESIGN §12
    }
  }
} as const);

// HARD bounds: changing any value in this export is a protocol version bump (TECH_SPEC §9).
export const bounds = deepFreeze({
  runStructure: {
    perRunHardCapTurns: 8000, // GAME_DESIGN §2
    floorReachability: {
      stairsReachableFromEntrance: true, // GAME_DESIGN §2
      questObjectivesReachable: true, // GAME_DESIGN §2
      noEntitiesInUnreachableCells: true // GAME_DESIGN §2
    }
  },
  playerCharacter: {
    hpCap: 99, // GAME_DESIGN §4
    levelCap: 12, // GAME_DESIGN §4
    fullnessCap: 100, // GAME_DESIGN §4
    overfedFullnessCap: 200, // GAME_DESIGN §4
    crossRunPowerPersistenceAllowed: false // GAME_DESIGN §4
  },
  statusVocabulary: {
    closedList: [
      "poison", // GAME_DESIGN §6
      "burn", // GAME_DESIGN §6
      "regen", // GAME_DESIGN §6
      "stun", // GAME_DESIGN §6
      "confusion", // GAME_DESIGN §6
      "slow", // GAME_DESIGN §6
      "haste", // GAME_DESIGN §6
      "blind", // GAME_DESIGN §6
      "shield", // GAME_DESIGN §6
      "weaken" // GAME_DESIGN §6
    ],
    durationTurns: {
      poison: {
        min: 3, // GAME_DESIGN §6
        max: 10 // GAME_DESIGN §6
      },
      burn: {
        min: 2, // GAME_DESIGN §6
        max: 5 // GAME_DESIGN §6
      },
      regen: {
        min: 3, // GAME_DESIGN §6
        max: 10 // GAME_DESIGN §6
      },
      stun: {
        min: 1, // GAME_DESIGN §6
        max: 2 // GAME_DESIGN §6
      },
      confusion: {
        min: 2, // GAME_DESIGN §6
        max: 6 // GAME_DESIGN §6
      },
      slow: {
        min: 3, // GAME_DESIGN §6
        max: 8 // GAME_DESIGN §6
      },
      haste: {
        min: 3, // GAME_DESIGN §6
        max: 8 // GAME_DESIGN §6
      },
      blind: {
        min: 3, // GAME_DESIGN §6
        max: 8 // GAME_DESIGN §6
      },
      shield: {
        min: 3, // GAME_DESIGN §6
        max: 10 // GAME_DESIGN §6
      },
      weaken: {
        min: 3, // GAME_DESIGN §6
        max: 8 // GAME_DESIGN §6
      }
    },
    maxConcurrentPerActor: 4, // GAME_DESIGN §6
    refreshesDurationOnly: true, // GAME_DESIGN §6
    hasteSlowCancel: true // GAME_DESIGN §6
  },
  effectVocabulary: {
    closedVerbList: [
      "damage", // GAME_DESIGN §7
      "heal", // GAME_DESIGN §7
      "apply_status", // GAME_DESIGN §7
      "cure_status", // GAME_DESIGN §7
      "buff_stat", // GAME_DESIGN §7
      "nutrition", // GAME_DESIGN §7
      "teleport_self", // GAME_DESIGN §7
      "teleport_target", // GAME_DESIGN §7
      "blink", // GAME_DESIGN §7
      "knockback", // GAME_DESIGN §7
      "reveal", // GAME_DESIGN §7
      "identify", // GAME_DESIGN §7
      "enchant", // GAME_DESIGN §7
      "summon", // GAME_DESIGN §7
      "transform", // GAME_DESIGN §7
      "dig" // GAME_DESIGN §7
    ],
    effectsPerBundle: {
      min: 1, // GAME_DESIGN §7
      max: 3 // GAME_DESIGN §7
    },
    verbs: {
      damage: {
        amount: {
          min: 1, // GAME_DESIGN §7
          max: 12 // GAME_DESIGN §7
        }
      },
      heal: {
        amount: {
          min: 1, // GAME_DESIGN §7
          max: 20 // GAME_DESIGN §7
        }
      },
      applyStatus: {
        usesStatusDurationBounds: true // GAME_DESIGN §7
      },
      cureStatus: {
        allKeyword: "all" // GAME_DESIGN §7
      },
      buffStat: {
        stats: [
          "ATK", // GAME_DESIGN §7
          "DEF" // GAME_DESIGN §7
        ],
        magnitudeAbs: {
          min: 1, // GAME_DESIGN §7
          max: 3 // GAME_DESIGN §7
        },
        durationTurns: {
          min: 5, // GAME_DESIGN §7
          max: 20 // GAME_DESIGN §7
        }
      },
      nutrition: {
        fullness: {
          min: 10, // GAME_DESIGN §7
          max: 100 // GAME_DESIGN §7
        }
      },
      teleportSelf: {
        targetMustBeRandomWalkableCell: true // GAME_DESIGN §7
      },
      teleportTarget: {
        targetMustBeRandomWalkableCell: true // GAME_DESIGN §7
      },
      blink: {
        distanceTiles: {
          min: 2, // GAME_DESIGN §7
          max: 4 // GAME_DESIGN §7
        }
      },
      knockback: {
        pushTiles: {
          min: 1, // GAME_DESIGN §7
          max: 3 // GAME_DESIGN §7
        },
        collisionDamage: {
          min: 1, // GAME_DESIGN §7
          max: 3 // GAME_DESIGN §7
        }
      },
      reveal: {
        targetKinds: [
          "map", // GAME_DESIGN §7
          "items", // GAME_DESIGN §7
          "enemies", // GAME_DESIGN §7
          "traps" // GAME_DESIGN §7
        ]
      },
      identify: {
        oneCarriedItemAllowed: true, // GAME_DESIGN §7
        allOfOneCategoryAllowed: true // GAME_DESIGN §7
      },
      enchant: {
        bonus: 1, // GAME_DESIGN §7
        itemCapIncrease: 3 // GAME_DESIGN §7
      },
      summon: {
        count: {
          min: 1, // GAME_DESIGN §7
          max: 3 // GAME_DESIGN §7
        },
        fromThisFloorRosterOnly: true, // GAME_DESIGN §7
        adjacentCellsOnly: true // GAME_DESIGN §7
      },
      transform: {
        maxBudgetCostRelation: "lessThanOrEqualTarget" // GAME_DESIGN §7
      },
      dig: {
        lengthTiles: {
          min: 1, // GAME_DESIGN §7
          max: 5 // GAME_DESIGN §7
        }
      }
    },
    triggers: {
      closedList: [
        "quaff", // GAME_DESIGN §7
        "read", // GAME_DESIGN §7
        "throw_hit", // GAME_DESIGN §7
        "equip_passive", // GAME_DESIGN §7
        "on_hit", // GAME_DESIGN §7
        "on_struck", // GAME_DESIGN §7
        "step", // GAME_DESIGN §7
        "use" // GAME_DESIGN §7
      ],
      procChancePercent: {
        onHit: {
          min: 10, // GAME_DESIGN §7
          max: 30 // GAME_DESIGN §7
        },
        onStruck: {
          min: 10, // GAME_DESIGN §7
          max: 30 // GAME_DESIGN §7
        }
      },
      toolCharges: {
        min: 1, // GAME_DESIGN §7
        max: 5 // GAME_DESIGN §7
      }
    },
    targetingShapes: {
      closedList: [
        "self", // GAME_DESIGN §7
        "melee", // GAME_DESIGN §7
        "bolt", // GAME_DESIGN §7
        "burst", // GAME_DESIGN §7
        "floor" // GAME_DESIGN §7
      ],
      boltRangeTiles: {
        min: 3, // GAME_DESIGN §7
        max: 8 // GAME_DESIGN §7
      },
      burstRadiusTiles: {
        min: 1, // GAME_DESIGN §7
        max: 2 // GAME_DESIGN §7
      },
      burstCenters: [
        "self", // GAME_DESIGN §7
        "impact" // GAME_DESIGN §7
      ]
    }
  },
  itemsEconomy: {
    weaponAtkBonus: {
      min: 1, // GAME_DESIGN §8
      max: 6 // GAME_DESIGN §8
    },
    armorDefBonus: {
      min: 1, // GAME_DESIGN §8
      max: 5 // GAME_DESIGN §8
    },
    enchantableOverBaseMax: 3, // GAME_DESIGN §8
    charmEquipPassiveEffects: 1, // GAME_DESIGN §8
    antiStarvationFoodFloorRule: {
      minFoodItems: 1, // GAME_DESIGN §8
      requiredBands: [
        "shallows", // GAME_DESIGN §8
        "middle" // GAME_DESIGN §8
      ]
    },
    questRewards: {
      statUpsAllowed: false, // GAME_DESIGN §8
      ruleBreaksAllowed: false // GAME_DESIGN §8
    }
  },
  enemyDesign: {
    behaviorsPerEnemy: {
      min: 1, // GAME_DESIGN §9
      max: 3 // GAME_DESIGN §9
    },
    abilitiesPerEnemy: {
      min: 0, // GAME_DESIGN §9
      max: 2 // GAME_DESIGN §9
    },
    statBudgetsByBand: {
      shallows: {
        hp: {
          min: 4, // GAME_DESIGN §9.1
          max: 14 // GAME_DESIGN §9.1
        },
        attack: {
          min: 2, // GAME_DESIGN §9.1
          max: 5 // GAME_DESIGN §9.1
        },
        defense: {
          min: 0, // GAME_DESIGN §9.1
          max: 2 // GAME_DESIGN §9.1
        },
        xpYield: {
          min: 2, // GAME_DESIGN §9.1
          max: 6 // GAME_DESIGN §9.1
        },
        maxEnemiesAlivePerFloor: 8 // GAME_DESIGN §9.1
      },
      middle: {
        hp: {
          min: 12, // GAME_DESIGN §9.1
          max: 30 // GAME_DESIGN §9.1
        },
        attack: {
          min: 5, // GAME_DESIGN §9.1
          max: 10 // GAME_DESIGN §9.1
        },
        defense: {
          min: 1, // GAME_DESIGN §9.1
          max: 4 // GAME_DESIGN §9.1
        },
        xpYield: {
          min: 5, // GAME_DESIGN §9.1
          max: 14 // GAME_DESIGN §9.1
        },
        maxEnemiesAlivePerFloor: 12 // GAME_DESIGN §9.1
      },
      lowest: {
        hp: {
          min: 24, // GAME_DESIGN §9.1
          max: 50 // GAME_DESIGN §9.1
        },
        attack: {
          min: 9, // GAME_DESIGN §9.1
          max: 16 // GAME_DESIGN §9.1
        },
        defense: {
          min: 3, // GAME_DESIGN §9.1
          max: 7 // GAME_DESIGN §9.1
        },
        xpYield: {
          min: 12, // GAME_DESIGN §9.1
          max: 25 // GAME_DESIGN §9.1
        },
        maxEnemiesAlivePerFloor: 10 // GAME_DESIGN §9.1
      }
    },
    behaviorVocabulary: {
      closedList: [
        "approach_melee", // GAME_DESIGN §9.2
        "keep_range", // GAME_DESIGN §9.2
        "flee_low_hp", // GAME_DESIGN §9.2
        "pack_hunter", // GAME_DESIGN §9.2
        "ambusher", // GAME_DESIGN §9.2
        "territorial", // GAME_DESIGN §9.2
        "guard", // GAME_DESIGN §9.2
        "patrol", // GAME_DESIGN §9.2
        "thief", // GAME_DESIGN §9.2
        "caster", // GAME_DESIGN §9.2
        "bodyguard", // GAME_DESIGN §9.2
        "mimic" // GAME_DESIGN §9.2
      ],
      parameters: {
        keepRangeDistanceTiles: {
          min: 2, // GAME_DESIGN §9.2
          max: 5 // GAME_DESIGN §9.2
        },
        fleeLowHpThresholdPercent: {
          min: 20, // GAME_DESIGN §9.2
          max: 50 // GAME_DESIGN §9.2
        },
        ambusherWakeRadiusTiles: {
          min: 1, // GAME_DESIGN §9.2
          max: 2 // GAME_DESIGN §9.2
        },
        territorialRadiusTiles: {
          min: 2, // GAME_DESIGN §9.2
          max: 4 // GAME_DESIGN §9.2
        },
        guardTetherRadiusTiles: {
          min: 1, // GAME_DESIGN §9.2
          max: 3 // GAME_DESIGN §9.2
        },
        casterCooldownTurns: {
          min: 3, // GAME_DESIGN §9.2
          max: 6 // GAME_DESIGN §9.2
        },
        packHunter: {
          allyCountMin: 2, // GAME_DESIGN §9.2
          allyCountMax: 4 // GAME_DESIGN §9.2
        }
      }
    }
  },
  trapsNpcsQuests: {
    traps: {
      perFloor: {
        min: 0, // GAME_DESIGN §10
        max: 4 // GAME_DESIGN §10
      },
      lethalFromFullHpAllowed: false // GAME_DESIGN §10
    },
    npcs: {
      perFloor: {
        min: 0, // GAME_DESIGN §10
        max: 2 // GAME_DESIGN §10
      },
      dialogueChoicesPerNode: {
        min: 2, // GAME_DESIGN §10
        max: 5 // GAME_DESIGN §10
      },
      dialogueMaxDepth: 3, // GAME_DESIGN §10
      merchantInventoryMaxItems: 6, // GAME_DESIGN §10
      invulnerableInMvp: true // GAME_DESIGN §10
    },
    quests: {
      objectiveClosedList: [
        "fetch", // GAME_DESIGN §10
        "kill", // GAME_DESIGN §10
        "reach", // GAME_DESIGN §10
        "deliver", // GAME_DESIGN §10
        "escort", // GAME_DESIGN §10
        "constraint" // GAME_DESIGN §10
      ],
      activePerFloorBandMax: 1, // GAME_DESIGN §10
      completableInRunRequired: true // GAME_DESIGN §10
    }
  },
  difficultyGate: {
    rejectsConsumableOnlySolvability: true, // GAME_DESIGN §11
    rejectsZeroThreatBelowDepth: 2, // GAME_DESIGN §11
    rejectsOutOfBoundsStatsEconomyAndBudget: true // GAME_DESIGN §11
  },
  directorManifest: {
    signatureMomentsPerRun: 1, // GAME_DESIGN §12
    signatureMomentBand: "middle", // GAME_DESIGN §12
    namedMadeEntityPermitted: true, // GAME_DESIGN §12
    textCaps: {
      narrationLineMaxChars: 160, // GAME_DESIGN §12
      nameMaxChars: 40, // GAME_DESIGN §12
      descriptionDialogueLineMaxChars: 200 // GAME_DESIGN §12
    }
  },
  gauntlet: {
    repairRetriesMax: 2 // TECH_SPEC §6, NORTH_STAR §5
  }
} as const);

export type GameConfig = typeof config;
export type GameBounds = typeof bounds;
