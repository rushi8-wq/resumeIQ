export function fixtureAIProvider() {
  return {
    name: 'test-fixture',
    async resolveModel() {
      return 'fixture-model';
    },
    async generate(payload) {
      const project =
        payload.evidence.find((e) => e.section === 'projects') ||
        payload.evidence.find((e) => e.section === 'workExperience');
      const source = project?.text || '';
      const improved = source
        .replace(/Built|Created/i, 'Developed')
        .replace(/ReactJS/g, 'React')
        .replace(/\bapp\b/g, 'application');
      const skill =
        payload.requirements.requiredSkills.find((s) =>
          source.toLowerCase().includes(s.toLowerCase()),
        ) || 'React';
      const clause =
        payload.requirements.skillEvidence.find((e) => e.skill === skill)
          ?.text || skill;
      const supported = {
        keyword: skill,
        importance: 'required',
        explanation:
          'Clarify the wording of the demonstrated project without changing facts.',
        requirement: clause,
        evidenceIds: project ? [project.id] : [],
        section: project?.section || null,
        index: project?.index ?? null,
        suggestedText: improved,
        verificationStatus: 'supported',
      };
      if (payload.mode === 'bullet')
        return {
          data: { suggestions: [supported] },
          model: 'fixture-model',
          usage: { inputTokens: 100, outputTokens: 100 },
        };
      const suggestions = [supported];
      for (const [importance, skills] of Object.entries(payload.missingSkills))
        for (const keyword of skills.slice(0, 1))
          suggestions.push({
            keyword,
            importance: importance === 'required' ? 'required' : 'preferred',
            explanation:
              'This technology is not demonstrated. Gain real experience before adding it.',
            requirement:
              payload.requirements.skillEvidence.find(
                (e) => e.skill === keyword,
              )?.text || keyword,
            evidenceIds: [],
            section: null,
            index: null,
            suggestedText: '',
            verificationStatus: 'skill_gap',
          });
      return {
        data: { suggestions },
        model: 'fixture-model',
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    },
  };
}
