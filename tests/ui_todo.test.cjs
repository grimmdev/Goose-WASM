// Real browser acceptance; rendering success must never be supplied by mocks.
const {runBrowserTests}=require('./browser.test.cjs');
async function runUiTodoTest(){return runBrowserTests({demos:['ui'],switching:false});}
if(require.main===module)runUiTodoTest().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runUiTodoTest};
