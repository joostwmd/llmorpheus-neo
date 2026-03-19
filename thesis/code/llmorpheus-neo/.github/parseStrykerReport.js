const fs = require('fs');

function stripAnsi(s) {
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function findAllFilesSummaryLine(strykerReport) {
  return strykerReport.split('\n').find((line) => {
    const cleaned = stripAnsi(line).trimStart();
    return cleaned.startsWith('All files') && cleaned.includes('|');
  });
}

/* Extract the number of killed/surviving/timed-out mutants from a Stryker report.
 */
function extractInfoFromStrykerReport(strykerReportFileName) {
  const strykerReport = fs.readFileSync(strykerReportFileName, 'utf8');

  // Print the summary. Starting from the end of the report, the summary begins
  // on the line that starts with "All tests"
  const summaryIndex = strykerReport.lastIndexOf('All tests');
  const summary = summaryIndex >= 0 ? strykerReport.slice(summaryIndex) : strykerReport;

  const rawAllFilesLine = findAllFilesSummaryLine(strykerReport);
  if (!rawAllFilesLine) {
    console.error(
      'parseStrykerReport: no "All files | ..." line found (Stryker may have crashed, been skipped, or changed output format). Writing placeholder StrykerInfo.json.',
    );
    const fallback = {
      mutationScore: 'NaN',
      nrKilled: '0',
      nrTimedOut: '0',
      nrSurvived: '0',
      time: '0',
    };
    fs.writeFileSync('StrykerInfo.json', JSON.stringify(fallback, null, 2));
    return;
  }

  const allFilesLine = stripAnsi(rawAllFilesLine);
  const stats = allFilesLine.split('|');
  if (stats.length < 5) {
    console.error('parseStrykerReport: unexpected "All files" row shape:', allFilesLine);
    const fallback = {
      mutationScore: 'NaN',
      nrKilled: '0',
      nrTimedOut: '0',
      nrSurvived: '0',
      time: '0',
    };
    fs.writeFileSync('StrykerInfo.json', JSON.stringify(fallback, null, 2));
    return;
  }

  const mutationScore = stats[1].trim();
  const nrKilled = stats[2].trim();
  const nrTimedOut = stats[3].trim();
  const nrSurvived = stats[4].trim();

  const realTimeLine = summary.split('\n').find((line) => line.startsWith('real'));
  const realTime = realTimeLine ? realTimeLine.substring(4).trim() : '0';

  console.log('Information extracted from Stryker report:');
  console.log(
    `  Mutation score: ${mutationScore} Killed: ${nrKilled}, TimedOut: ${nrTimedOut}, Survived: ${nrSurvived} Time: ${realTime}`,
  );

  const result = {
    mutationScore,
    nrKilled,
    nrTimedOut,
    nrSurvived,
    time: realTime,
  };
  fs.writeFileSync('StrykerInfo.json', JSON.stringify(result, null, 2));
}

const fileName = process.argv[2];
if (!fileName) {
  console.error('parseStrykerReport: missing path to StrykerOutput.txt');
  process.exit(1);
}
extractInfoFromStrykerReport(fileName);