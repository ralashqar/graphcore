import copy
import unittest
from handler import validate_input, MODEL_REVISION


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.input = {'version': 1, 'modelRevision': MODEL_REVISION, 'recipe': {
            'version': 1, 'id': 'idle', 'state': 'idle', 'rigRevision': 'a'*64,
            'model': 'Kimodo-SOMA-RP-v1.1', 'prompt': 'A humanoid stands still.',
            'duration': 4, 'candidates': 1, 'seed': 0, 'loop': True, 'targetSpeed': 0,
            'rootMode': 'in_place', 'contacts': [], 'poses': [], 'path': [],
            'thresholds': {'version': 1, 'maxContactError': .03, 'maxBoneLengthError': .005, 'maxSeamAngle': .1, 'maxSeamVelocity': .2, 'maxCorrection': .1}}}

    def test_valid_request(self):
        self.assertEqual(validate_input(self.input)['state'], 'idle')

    def test_excessive_work_and_scripts(self):
        for patch in [{'duration': 9}, {'candidates': 4}, {'script': 'import os'}, {'seed': -1}, {'targetSpeed': float('nan')}]:
            value = copy.deepcopy(self.input)
            value['recipe'].update(patch)
            with self.assertRaises(Exception): validate_input(value)

    def test_constraints_cannot_exceed_duration(self):
        self.input['recipe']['path'] = [{'time': 5, 'x': 0, 'z': 0}]
        with self.assertRaises(ValueError): validate_input(self.input)

    def test_wrong_model_revision(self):
        self.input['modelRevision'] = 'latest'
        with self.assertRaises(Exception): validate_input(self.input)


if __name__ == '__main__':
    unittest.main()
