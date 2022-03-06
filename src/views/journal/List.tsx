import React from 'react';
import faker from "@faker-js/faker/locale/de";

import {JournalMessage} from 'components';
import {MessageStatus as Status} from 'types';

import _ from 'lodash';

const getRandomStatus = () => { return _.sample(Object.values(Status)) as Status }

const ASSIGNMENTS = ["Pol", "Lage", "San", "FW", "Tech"]

function List() {
  return (
    <div>
        <h3 className="title is-3">Journal</h3>
        { _.times(faker.datatype.number(20), () => 
              { 
                return <JournalMessage key={faker.datatype.uuid()} assignments={ASSIGNMENTS.slice(0,faker.datatype.number(ASSIGNMENTS.length))} status={getRandomStatus()} sender={faker.name.findName()} receiver={faker.name.findName()} message={faker.lorem.paragraphs(2)}  timeDate={faker.date.recent(1)}/>
              }
            )
        }
    </div>
  );
}

export default List;
