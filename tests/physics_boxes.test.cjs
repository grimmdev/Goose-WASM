// Real browser acceptance; rendering success must never be supplied by mocks.
const {runBrowserTests}=require('./browser.test.cjs');
async function runPhysicsBoxesTest(){return runBrowserTests({demos:['physics'],switching:false});}
if(require.main===module)runPhysicsBoxesTest().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runPhysicsBoxesTest};
