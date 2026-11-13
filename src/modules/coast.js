// Package "coast": the Yellow Sea (custom ocean shader with shore foam and swash), the reddish granite reef of 太平角,
// the timber boardwalk 海滨木栈道, and the small things of the shore: seaweed wrack on the sand, the float line of
// 第二海水浴场, slow ships in the haze and silhouettes on the two far headlands (汇泉角, 太平角).
//
// Draw calls: ocean 1 + reef 4 (one InstancedMesh per base shape, the three casting shapes split alongshore) + boardwalk 1 + wrack 1 + buoys 1 + far headlands 1
// + ships 2 = 11.
import { layoutBoardwalk, buildBoardwalk } from './coast/boardwalk.js';
import { placeRocks, buildRocks } from './coast/rocks.js';
import { buildOcean } from './coast/ocean.js';
import { buildWrack, buildBuoys, buildShips, buildFarSilhouettes } from './coast/details.js';

export async function create(ctx) {
  const group = ctx.group('coast');

  const layout = layoutBoardwalk(ctx.world, ctx.map);
  const rockList = placeRocks(ctx, layout);

  const ocean = buildOcean(ctx, rockList, group);
  const rocks = buildRocks(ctx, rockList, group);
  const boardwalk = buildBoardwalk(ctx, layout, group);
  const wrack = buildWrack(ctx, group);
  const buoys = buildBuoys(ctx, group);
  const ships = buildShips(ctx, group);
  const far = buildFarSilhouettes(ctx, group);
  const parts = [ocean, rocks, boardwalk, wrack, buoys, ships, far];

  if (ctx.params.debug) {
    console.log(`[coast] triangles: ocean ${ocean.triangles}, reef ${rocks.triangles} (${rockList.length} rocks, ${rocks.colliders} colliders), ` +
      `boardwalk ${boardwalk.triangles}, wrack ${wrack.triangles}, buoys ${buoys.triangles}, ships ${ships.triangles}, far ${far.triangles}`);
  }

  return {
    update(dt, t) {
      ocean.update(t);
      buoys.update(t);
      ships.update(t);
    },
    onPreset() { /* everything is continuous: read from ctx.env.current every frame */ },
    dispose() {
      for (const p of parts) p.dispose();
      ctx.collision.removeTag('reef');
      ctx.collision.removeTag('boardwalk-rail');
      ctx.scene.remove(group);
    },
  };
}
