import { PieChart, Pie, Cell } from 'recharts';
export const componentLabels = {
  requiredSkills: 'Required skills',
  experience: 'Experience & projects',
  semantic: 'Text similarity',
  preferredSkills: 'Preferred skills',
  qualifications: 'Education & qualifications',
};
export function ScoreSummary({ analysis }) {
  const score = analysis.overallScore;
  const chartScore = score ?? 0;
  return (
    <section className="match-score-panel" aria-labelledby="alignment-title">
      <div
        className="match-score-visual"
        role="img"
        aria-label={
          score === null
            ? 'No alignment score'
            : `Estimated alignment ${score}%`
        }
      >
        <PieChart width={200} height={200} accessibilityLayer={false}>
          <Pie
            data={[{ value: chartScore }, { value: 100 - chartScore }]}
            dataKey="value"
            innerRadius={76}
            outerRadius={88}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill="#2c6e4f" />
            <Cell fill="#dce2da" />
          </Pie>
        </PieChart>
        <strong>{score === null ? '—' : `${Math.round(score)}%`}</strong>
      </div>
      <div className="score-caption">
        <span className="eyebrow">ESTIMATED ALIGNMENT</span>
        <h2 id="alignment-title">{analysis.interpretation}</h2>
        <p>{analysis.disclaimer}</p>
        <span className="tag">
          {analysis.semantic.method === 'embeddings'
            ? `Embeddings · ${analysis.semantic.model}`
            : 'Local TF-IDF fallback'}
        </span>
        <span className="tag">{analysis.confidence} confidence</span>
        <p className="score-precision">
          Calculated score: {score ?? 'Not available'}
          {score === null ? '' : '%'} · {analysis.algorithmVersion}
        </p>
      </div>
      <div className="component-breakdown">
        <h2>How the score adds up</h2>
        {Object.entries(analysis.componentScores).map(([key, component]) => (
          <div className="component-row" key={key}>
            <div>
              <strong>{componentLabels[key]}</strong>
              <span>
                {component.applicable
                  ? `${component.score}% · ${component.effectiveWeight}% weight`
                  : 'Not applicable · weight redistributed'}
              </span>
            </div>
            <progress
              max="100"
              value={component.score ?? 0}
              aria-label={`${componentLabels[key]} score`}
            />
            <p>{component.explanation}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
