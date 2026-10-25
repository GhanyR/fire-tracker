import unittest
import numpy as np
from pipeline import cluster


class PartialSensorTests(unittest.TestCase):
    def test_modis_only_build_keeps_observations_without_fabricating_viirs_pixels(self):
        rows=30
        data={'lon':np.full(rows,114.),'lat':np.full(rows,-2.),'ts':np.arange(rows)*60+1792886400.,'sat':np.full(rows,8),'frp':np.full(rows,2.),'conf':np.full(rows,2),'night':np.zeros(rows)}
        incidents,pixels,stats=cluster.build(data,np.zeros(rows,dtype=int))
        self.assertEqual(len(pixels['lat']),0)
        self.assertGreater(len(incidents),0)
        self.assertEqual(incidents[0]['n'],rows)
        self.assertEqual(incidents[0]['npix'],0)


if __name__=='__main__':unittest.main()
