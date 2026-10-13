import {createElement} from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {GlobalComparison} from '../../play-home/home/GlobalComparison';
import type {LobbyGame} from '../../src/transport/lobby';
const game=(result:string,wins:number,losses:number,key='same')=>({result,globalMatchup:{key,wins,losses,draws:0}} as LobbyGame);
const render=(games:LobbyGame[])=>renderToStaticMarkup(createElement(GlobalComparison,{games}));
test('comparison shows correctly signed percentage points and de-duplicates global samples',()=>{
 const green=render([game('Win',60,40),game('Win',60,40)]);
 assert.match(green,/Global 60.0%/);assert.match(green,/100 results/);assert.match(green,/40.0 percentage points above/);
 assert.match(render([game('Loss',60,40)]),/60.0 percentage points below/);
 assert.match(render([game('Win',50,50),game('Loss',50,50)]),/0.0 percentage points difference/);
});
test('comparison weights matching cohorts and does not invent missing or draw-only baselines',()=>{
 assert.match(render([game('Win',80,20),game('Loss',40,60,'other')]),/Global 60.0%/);
 assert.match(render([{result:'Win'} as LobbyGame]),/unavailable/);
 assert.match(render([game('Win',0,0)]),/unavailable/);
 assert.match(render([game('Draw',60,40)]),/No decided games/);
});
