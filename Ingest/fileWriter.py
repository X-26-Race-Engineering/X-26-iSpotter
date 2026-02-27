import os
import json
import numpy as np

class fileWriter:

    def write_file(car, track, data):

        if not os.path.exists('database'):
            os.mkdir('database')

        os.chdir('database/')
        
        filename = f"{str(car)}_{str(track)}.json"

        with open(filename, 'w') as f:
            json.dump(data, f, indent=4)
            f.close()

        os.chdir('../')

    def pull_file(car, track):
        
        filename = f"{str(car)}_{str(track)}.json"

        if os.path.exists('database'):
            os.chdir('database/')

            if os.path.isfile(filename):
                with open(filename, 'r') as f:
                    ret = json.load(f)
                    f.close()
                    
                os.chdir('../')
                return ret
        
            else:
                os.chdir('../')
                return {
                        'lapNum': -1,
                        'lapTime': np.inf,
                        'xVals': [],
                        'velos': [],
                        'throttle': [],
                        'brake': [],
                        'fuelUse': [],
                        'gear': [],
                        'rpm': []
                    }
            
