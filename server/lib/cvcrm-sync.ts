// @ts-nocheck
export function createCvcrmSync(dependencies) {
  const {
    addHistory,
    backupFiles,
    buildIntegrity,
    cacheFile,
    configured,
    emptyCache,
    fetchAll,
    fetchDetailedAppraisals,
    fetchEnterpriseAvailability,
    integrityFile,
    mergeData,
    rawFile,
    readJson,
    readRateLimitState,
    recordPriceHistory,
    respectPersistentCooldown,
    setProgress,
    waitBetweenPhases,
    writeJson,
  } = dependencies;
  let syncing = false;
  async function syncCvcrm(trigger = "manual") {
    if (syncing)
      return { ok: false, message: "Sincronização já está em andamento." };
    if (!configured())
      throw new Error(
        "CVCRM ainda não configurado. Execute CONFIGURAR_CVCRM.bat.",
      );

    syncing = true;
    setProgress({
      phase: "starting",
      label: "Preparando sincronização segura",
      currentPage: 0,
      totalPages: 0,
      loaded: 0,
      totalRecords: 0,
      retryWaitSeconds: null,
      warning: null,
      endpoint: null,
    });

    const startedAt = new Date().toISOString();
    const previousCache = readJson(cacheFile, emptyCache);

    let unitsRows = [];
    let situationRows = [];
    let priceRows = [];
    let appraisalData = {
      perEnterprise: new Map(),
      dashboard: new Map(),
      diagnostics: [],
    };
    let enterpriseAvailability = new Map();
    let merged = {
      units: [],
      enterprises: [],
      allUnits: [],
      allEnterprises: [],
    };

    try {
      await respectPersistentCooldown();

      enterpriseAvailability = await fetchEnterpriseAvailability();
      const eligibleEnterpriseIds = new Set(
        [...enterpriseAvailability.entries()]
          .filter(([, rule]) => rule.eligible)
          .map(([id]) => String(id)),
      );
      const availabilityCheckedAt = new Date().toISOString();
      const filteredEnterprises = (previousCache.enterprises || [])
        .filter((enterprise) =>
          eligibleEnterpriseIds.has(String(enterprise.id)),
        )
        .map((enterprise) => ({
          ...enterprise,
          availableUnits:
            enterpriseAvailability.get(String(enterprise.id))
              ?.availableUnits ?? enterprise.availableUnits,
        }));
      const filteredIds = new Set(
        filteredEnterprises.map((enterprise) => String(enterprise.id)),
      );
      const filteredUnits = (previousCache.units || []).filter((unit) =>
        filteredIds.has(String(unit.enterpriseId)),
      );
      writeJson(cacheFile, {
        ...previousCache,
        enterprises: filteredEnterprises,
        units: filteredUnits,
        availabilityCheckedAt,
      });

      unitsRows = await fetchAll(
        "/api/v1/cvdw/unidades",
        "1/3 • Baixando unidades",
      );
      if (!unitsRows.length) {
        throw new Error(
          "A API /unidades respondeu sem registros. O catálogo anterior foi preservado.",
        );
      }

      await waitBetweenPhases("situações");

      situationRows = await fetchAll(
        "/api/v1/cvdw/unidades/situacao",
        "2/3 • Baixando situações",
      );
      if (!situationRows.length) {
        throw new Error(
          "A API /unidades/situacao respondeu sem registros. O catálogo anterior foi preservado.",
        );
      }

      await waitBetweenPhases("preços");

      priceRows = await fetchAll(
        "/api/v1/cvdw/unidades/precos",
        "3/3 • Baixando preços",
      );
      if (!priceRows.length) {
        throw new Error(
          "A API /unidades/precos respondeu sem registros. O catálogo anterior foi preservado.",
        );
      }

      // O CVDW de preços não contém a coluna comercial "VALOR DO IMÓVEL (1x)".
      // Essa coluna é obtida na tabela de preço detalhada da API convencional.
      appraisalData = await fetchDetailedAppraisals(unitsRows);

      setProgress({
        phase: "processing",
        label: "Cruzando unidades, situações e preços",
        endpoint: null,
        currentPage: 0,
        totalPages: 0,
        loaded: 0,
        totalRecords: 0,
        retryWaitSeconds: null,
      });

      merged = mergeData(
        unitsRows,
        situationRows,
        priceRows,
        appraisalData.perEnterprise,
        appraisalData.dashboard,
        enterpriseAvailability,
      );
      const appraisalErrors = appraisalData.diagnostics
        .filter((d) => !d.ok)
        .map((d) => ({
          endpoint: `tabela detalhada ${d.enterpriseName}`,
          message: d.error,
        }));
      const integrity = buildIntegrity(
        unitsRows,
        situationRows,
        priceRows,
        merged,
        appraisalErrors,
      );
      integrity.appraisals = {
        enterprisesRequested: appraisalData.diagnostics.length,
        enterprisesOk: appraisalData.diagnostics.filter((d) => d.ok).length,
        unitsWithAppraisal: merged.units.filter((u) => Number(u.appraisal) > 0)
          .length,
      };

      if (!merged.allUnits.length) {
        throw new Error(
          "O cruzamento final resultou em 0 unidades. O catálogo anterior foi preservado.",
        );
      }
      if (!merged.enterprises.length) {
        throw new Error(
          "O cruzamento final resultou em 0 empreendimentos comerciais. O catálogo anterior foi preservado.",
        );
      }

      const finished = new Date().toISOString();
      const nextCache = {
        lastSync: startedAt,
        lastSuccess: finished,
        status: integrity.warnings.length ? "warning" : "ok",
        error: integrity.warnings.join(" | ") || null,
        enterprises: merged.enterprises,
        units: merged.units,
        stats: {
          unitsSource: unitsRows.length,
          situationsSource: situationRows.length,
          pricesSource: priceRows.length,
          enterprisesSource: enterpriseAvailability.size,
          allEnterprises: merged.allEnterprises.length,
          commercialEnterprises: merged.enterprises.length,
          unitsNormalized: merged.units.length,
          availableUnits: integrity.availableCount,
          availableWithPrice: integrity.availableWithPriceCount,
          availableWithoutPrice: integrity.availableWithoutPriceCount,
          trigger,
          partial: false,
        },
      };

      writeJson(integrityFile, integrity);
      writeJson(rawFile, {
        at: finished,
        envelope: "pagina/registros/total_de_registros/total_de_paginas/dados",
        counts: {
          unidades: unitsRows.length,
          situacoes: situationRows.length,
          precos: priceRows.length,
          tabelasDetalhadas: appraisalData.diagnostics.filter((d) => d.ok)
            .length,
          unidadesComValorImovel: merged.units.filter(
            (u) => Number(u.appraisal) > 0,
          ).length,
        },
        samples: {
          unidades: unitsRows.slice(0, 20),
          situacoes: situationRows.slice(0, 20),
          precos: priceRows.slice(0, 20),
        },
        errors: [],
      });

      // Preserva uma cópia antes de publicar o novo catálogo e registra a evolução de preços.
      try {
        backupFiles("antes-sync");
      } catch {}
      // ÚNICO momento em que o catálogo publicado é substituído.
      writeJson(cacheFile, nextCache);
      try {
        recordPriceHistory(nextCache);
      } catch (error) {
        console.warn("[HISTORICO PRECO]", error.message);
      }

      addHistory(
        "Sincronização CVCRM concluída",
        `${merged.enterprises.length} empreendimentos • ${integrity.availableCount} disponíveis • ${integrity.availableWithPriceCount} com preço`,
        { trigger },
      );

      setProgress({
        phase: "done",
        label: "Sincronização concluída",
        endpoint: null,
        currentPage: 0,
        totalPages: 0,
        loaded: merged.units.length,
        totalRecords: merged.units.length,
        retryWaitSeconds: null,
        warning: nextCache.error,
      });

      return {
        ok: true,
        ...nextCache.stats,
        lastSuccess: finished,
        warning: nextCache.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Não altera cache.json em caso de erro.
      writeJson(integrityFile, {
        at: new Date().toISOString(),
        published: false,
        preservedPreviousCatalog: true,
        previousLastSuccess: previousCache.lastSuccess || null,
        stagedCounts: {
          unidades: unitsRows.length,
          situacoes: situationRows.length,
          precos: priceRows.length,
          tabelasDetalhadas: appraisalData.diagnostics.filter((d) => d.ok)
            .length,
          unidadesComValorImovel: merged.units.filter(
            (u) => Number(u.appraisal) > 0,
          ).length,
        },
        warnings: [message],
        rateLimit: readRateLimitState(),
      });

      addHistory(
        "Sincronização CVCRM não publicada",
        `${message} • catálogo anterior preservado`,
        { trigger },
      );

      setProgress({
        phase: "error",
        label: "Sincronização não publicada",
        warning: `${message} Catálogo anterior preservado.`,
        retryWaitSeconds: null,
      });

      throw error;
    } finally {
      syncing = false;
    }
  }

  function startSync(trigger = "manual") {
    if (syncing) {
      return {
        ok: true,
        started: false,
        syncing: true,
        message:
          "Já existe uma sincronização em andamento. Nenhuma nova chamada foi criada.",
      };
    }

    syncCvcrm(trigger).catch((error) =>
      console.error("[CVCRM]", error.message),
    );
    return {
      ok: true,
      started: true,
      syncing: true,
      message: "Sincronização segura iniciada em segundo plano.",
    };
  }
  function getSyncing() {
    return syncing;
  }

  return { getSyncing, startSync, syncCvcrm };
}
