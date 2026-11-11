// Real browser acceptance; rendering success must never be supplied by mocks.
const {runBrowserTests}=require('./browser.test.cjs');
async function runCubeTest(){return runBrowserTests({demos:['cube'],switching:false});}
if(require.main===module)runCubeTest().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runCubeTest};
