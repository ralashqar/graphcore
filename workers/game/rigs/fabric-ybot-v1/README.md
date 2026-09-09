# Fabric Y-Bot mannequin

Derived at the repository owner's request from `public/HumanoidAnimations/ybot_mixamo.glb` in Fabric commit `ece321fe728af45ad88a7c068a2c02fa50e985ba`. Exact source and derived hashes are in `provenance.json`.

Contains only the rest mesh, two material/mesh parts and skin weights. Source animation tracks were removed. Canonical humanoid joint names and virtual unweighted joints preserve the existing 77-joint gameplay pose interface; proportions follow Y-Bot. This is a separate rig revision, not a replacement of SOMA's rest metadata. Old animations must be re-baked, not rebound to this rig.

`scripts/game-derive-fabric-rig.py` reproduces the derivative using Blender 5.0.1 and the pinned source at `output/game-rig-evaluation/ybot_mixamo.glb`. No Fabric gameplay code or animation library is copied. The upstream checkout did not include a root asset license; source lineage is recorded here rather than assigning these third-party assets a new license.
