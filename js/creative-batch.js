/* Work delivery is separate from transport, model output normalization and library adoption. */
(function(root){
  'use strict';
  const isWork=kind=>kind==='character' || kind==='world';
  async function run({modules,contextFor,request,deliver,active}){
    const remaining=new Set(modules),issues=[],delivered=[];
    const issue=(kind,reason)=>{issues.push({kind,reason});};
    for(const kind of modules){
      if(!active() || !remaining.has(kind))continue;
      remaining.delete(kind);
      const context=contextFor(kind), offered=[kind,...Array.from(remaining).filter(isWork)];
      let response;
      try{response=await request(kind,context,offered);}
      catch(error){
        // A failed connection must not trigger another billed request. Earlier works are still available.
        if(!delivered.length || error.code==='needs-input')throw error;
        if(active())issue(kind,error.message);
        break;
      }
      if(!active())break;
      if(!isWork(kind)){
        await deliver(kind,response,context);
        delivered.push(kind);
        continue;
      }
      // A service may provide both requested works in its first response.
      const handled=offered.filter(item=>item===kind || response.present.includes(item));
      for(const item of handled){
        if(!active())break;
        remaining.delete(item);
        const result=response.results[item];
        if(!result){issue(item,response.errors[item]);continue;}
        await deliver(item,result,item===kind?context:contextFor(item),response.sourceKey,response.recordId);
        delivered.push(item);
      }
    }
    return {delivered,issues};
  }
  function plan(virtual,kind,result,context,{previous,batchId,inputs,sourceKey,recordId}){
    const merged=root.NIJANCreation.mergeResult(previous?.result,result);
    root.NIJANCreation.withdraw(virtual,previous);
    const proposal=root.NIJANAI.proposal(virtual,'create:'+kind,merged,context);
    root.NIJANCreation.preserveIds(proposal,previous);
    proposal.batchId=batchId;
    proposal.creationInput=inputs;
    proposal.draftRevision=previous?.draftRevision ?? null;
    proposal.result=merged;
    if(isWork(kind) && sourceKey){
      proposal.sourceKey=sourceKey;
      const collection=kind==='character'?'characters':'worldBooks';
      const value=proposal.operations.find(op=>op.kind==='add' && op.path[0]===collection)?.value;
      const earlier=previous?.operations.find(op=>op.kind==='add' && op.path[0]===collection)?.value;
      if(value)root.TAWorkOutcomes.stamp(value,earlier,recordId,sourceKey);
    }
    if(proposal.operations.length)root.NIJANAI.commit(virtual,structuredClone(proposal));
    return proposal;
  }
  root.TACreativeBatch={run,plan,isWork};
})(globalThis);
