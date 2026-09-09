import copy
import json
import unittest
from pathlib import Path
from handler import validate_request

class ContractTest(unittest.TestCase):
    def setUp(self):
        import hashlib
        manifest_bytes=Path(__file__).with_name('release.json').read_bytes()
        manifest=json.loads(manifest_bytes)
        digest=hashlib.sha256(manifest_bytes).hexdigest()
        self.request={'version':2,'modelRevision':digest,'recipe':{
            'version':2,'provider':'motionbricks','model':'MotionBricks-G1-v1','id':'test.idle',
            'state':'idle','primitive':'idle','purpose':'clip','rigRevision':'a'*64,
            'prompt':'A neutral idle request','duration':2,'candidates':1,'seed':42,'loop':True,
            'targetSpeed':0,'rootMode':'in_place','contacts':[],'poses':[],'path':[],
            'thresholds':{'version':1,'maxCorrection':.1,'maxContactError':.03,'maxBoneLengthError':.005,'maxSeamAngle':.1,'maxSeamVelocity':.2},
            'provenance':{'provider':'motionbricks','modelRevision':digest,'sourceRevision':manifest['sourceRevision'],
                'skeleton':'g1skel34','adapter':'g1-soma-1.0.0','validation':'animation-1.1.0'}}}
    def test_valid_without_loading_gpu(self):
        self.assertEqual(validate_request(self.request)['state'],'idle')
    def test_executable_or_cross_provider_input(self):
        for change in ({'code':'print(1)'},{'provider':'kimodo'},{'duration':9},{'candidates':2},{'state':'roll'},{'loop':False}):
            value=copy.deepcopy(self.request);value['recipe'].update(change)
            with self.assertRaises(Exception): validate_request(value)
    def test_constraints_not_silently_dropped(self):
        value=copy.deepcopy(self.request)
        value['recipe']['path']=[{'time':0,'x':0,'z':0}]
        with self.assertRaises(ValueError): validate_request(value)
    def test_diagnostic_has_separate_semantics(self):
        value=copy.deepcopy(self.request)
        value['recipe'].update(purpose='diagnostic',primitive='idle_walk_turn_stop',loop=False)
        self.assertEqual(validate_request(value)['purpose'],'diagnostic')
        value['recipe']['loop']=True
        with self.assertRaises(ValueError): validate_request(value)

if __name__=='__main__': unittest.main()
