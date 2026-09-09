"""CPU Blender regression: correct knee plane, fixed lengths, bounded reach."""
import sys, unittest
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from bake_adapter_v1_2 import solve_leg

class HumanLegTests(unittest.TestCase):
    def test_human_bend_plane_and_lengths(self):
        for sign in (-1,1):
            for forward in (-.2,0,.2):
                hip=Vector((sign*.1,.95,0));foot=Vector((sign*.09,.08,forward))
                knee,end=solve_leg(hip,foot,.45,.45,Vector((0,0,1)))
                self.assertAlmostEqual((knee-hip).length,.45,places=6)
                self.assertAlmostEqual((end-knee).length,.45,places=6)
                self.assertLess((end-foot).length,1e-5)
                self.assertLess(abs((knee-hip).dot((foot-hip).cross(Vector((0,0,1))).normalized())),1e-6)
                self.assertLess(abs(knee.x-hip.x),.02)
    def test_unreachable_target_rejected(self):
        with self.assertRaises(ValueError): solve_leg(Vector(),Vector((0,-2,0)),.45,.45,Vector((0,0,1)))
    def test_degenerate_target_rejected(self):
        with self.assertRaises(ValueError): solve_leg(Vector(),Vector(),.45,.45,Vector((0,0,1)))

if __name__=='__main__': unittest.main(argv=[sys.argv[0]])
