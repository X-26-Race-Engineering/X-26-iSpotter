import numpy as np

class sessionInfoParsers:

    """Returns parsed list of car idxs similar to get_all_cars class only including cars in the driver's class

    Returns:
        Prased list of dictionaries shown as below
        [{
            Car IDX: Initialized here
            Class: Initialized here
            Driver_Name: Initialized here
            Class_Color: Initialized here based on classes pulled by this method
            Lap_Started: Initialized here and updated in race engine
            Car_Number: Initialized here
            Pit_Status: Initialized here and updated in race engine
            Relative_Gap: Initialized here and updated in race engine
            Gap_To_Leader: Initialized here and updated in race engine
        }]
    """
    @staticmethod
    def get_cars_in_class(stream):
        car_list = []
        me_idx = int(stream['PlayerCarIdx'] or 1)
        me_class = stream['CarIdxClass'][me_idx]
        pos = 1
        
        if stream['DriverInfo'] and stream['DriverInfo']['Drivers']:
            for driver in stream['Drivers']:
                if stream['CarIdxClass'][driver['CarIdx']] == me_class:
                    temp = {
                        'CarIdx': driver['CarIdx'],
                        'Driver_Name': driver['UserName'],
                        'Class_Color': driver['CarClassColor'],
                        'Lap_Started': 0,
                        'Car_Number': driver['CarNumber'],
                        'Pit_Status': False,
                        'Relative_Gap': 0,
                        'Gap_To_Leader': 0,
                        'Position': pos,
                        'Class_Pos': pos,
                        'Lap_Dist': 0
                    }
                    car_list.append(temp)
                    pos += 1
                
        return car_list

    """Returns a list of all car info by car number for circle of doom to use, only called once

    Returns:
        List of dictionaries shown as below
        [{
            Car IDX: Initialized here
            Class: Initialized here
            Driver_Name: Initialized here
            Class_Color: Initialized here based on classes pulled by this method
            Lap_Started: Initialized here and updated in race engine
            Car_Number: Initialized here
            Pit_Status: Initialized here and updated in race engine
            Relative_Gap: Initialized here and updated in race engine
            Gap_To_Leader: Initialized here and updated in race engine
        }]
    """
    @staticmethod
    def get_all_cars(stream):
        car_list = []
        pos = 1

        if stream['DriverInfo'] and stream['DriverInfo']['Drivers']:
            for driver in stream['DriverInfo']['Drivers']:
                temp = {
                    'CarIdx': driver['CarIdx'],
                    'Driver_Name': driver['UserName'],
                    'Class_Color': '#' + str(driver['CarClassColor'])[2:],
                    'Lap_Started': 0,
                    'Car_Number': driver['CarNumber'],
                    'Pit_Status': False,
                    'Relative_Gap': 0,
                    'Gap_To_Leader': 0,
                    'Position': pos,
                    'Class_Pos': pos,
                    'Lap_Dist': 0
                    }
                car_list.append(temp)
                pos += 1
            
        return car_list
            

    """Returns all relavant session info

    Returns:
        Returns session info in JSON directly from the IRSDK JSON
    """
    @staticmethod
    def get_session_info(stream):
        curr_session = 1
        if stream['SessionInfo']:
            curr_session = int(stream['SessionInfo']['numSessions']) - 1
            return stream['SessionInfo'][curr_session]
        return {}

    @staticmethod
    def get_track_info(stream):
        pass

    @staticmethod
    def get_all(stream):
        return {
            'cars_in_class': sessionInfoParsers.get_cars_in_class(stream),
            'all_cars': sessionInfoParsers.get_all_cars(stream),
            'session_info': sessionInfoParsers.get_session_info(stream),
            'track_info': sessionInfoParsers.get_track_info(stream)
        }