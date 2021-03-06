import * as _ from 'underscore';
import { Segments } from '../../../db/models';
import { ICondition, ISegment } from '../../../db/models/definitions/segments';
import { fetchElk } from '../../../elasticsearch';

export const fetchBySegments = async (segment: ISegment, action: 'search' | 'count' = 'search'): Promise<any> => {
  if (!segment || !segment.conditions) {
    return [];
  }

  const { contentType } = segment;
  const index = contentType === 'customer' ? 'customers' : 'companies';
  const idField = contentType === 'customer' ? 'customerId' : 'companyId';

  const propertyPositive: any[] = [];
  const propertyNegative: any[] = [];

  if (contentType === 'customer') {
    propertyNegative.push({
      term: {
        status: 'Deleted',
      },
    });
  }

  const eventPositive = [];
  const eventNegative = [];

  await generateQueryBySegment({ segment, propertyPositive, propertyNegative, eventNegative, eventPositive });

  let idsByEvents = [];

  if (eventPositive.length > 0 || eventNegative.length > 0) {
    const eventsResponse = await fetchElk('search', 'events', {
      _source: idField,
      size: 10000,
      query: {
        bool: {
          must: eventPositive,
          must_not: eventNegative,
        },
      },
    });

    idsByEvents = eventsResponse.hits.hits.map(hit => hit._source[idField]);
  }

  if (action === 'count') {
    if (idsByEvents.length > 0) {
      propertyPositive.push({
        terms: {
          _id: idsByEvents,
        },
      });
    }

    return {
      positiveList: propertyPositive,
      negativeList: propertyNegative,
    };
  }

  const response = await fetchElk('search', index, {
    _source: false,
    size: 10000,
    query: {
      bool: {
        must: propertyPositive,
        must_not: propertyNegative,
      },
    },
  });

  const idsByContentType = response.hits.hits.map(hit => hit._id);

  let ids = idsByContentType.length ? idsByContentType : idsByEvents;

  if (idsByContentType.length > 0 && idsByEvents.length > 0) {
    ids = _.intersection(idsByContentType, idsByEvents);
  }

  return ids;
};

const generateQueryBySegment = async (args: {
  propertyPositive;
  propertyNegative;
  eventPositive;
  eventNegative;
  segment: ISegment;
}) => {
  const { segment, propertyNegative, propertyPositive, eventNegative, eventPositive } = args;

  // Fetching parent segment
  const embeddedParentSegment = await Segments.findOne({ _id: segment.subOf });
  const parentSegment = embeddedParentSegment;

  if (parentSegment) {
    await generateQueryBySegment({ ...args, segment: parentSegment });
  }

  const propertyConditions: ICondition[] = [];
  const eventConditions: ICondition[] = [];

  for (const condition of segment.conditions) {
    if (condition.type === 'property') {
      propertyConditions.push(condition);
    }

    if (condition.type === 'event') {
      eventConditions.push(condition);
    }
  }

  for (const condition of propertyConditions) {
    elkConvertConditionToQuery({
      field: condition.propertyName || '',
      operator: condition.propertyOperator || '',
      value: condition.propertyValue || '',
      positive: propertyPositive,
      negative: propertyNegative,
    });
  }

  for (const condition of eventConditions) {
    const { eventOccurence, eventName, eventOccurenceValue, eventAttributeFilters = [] } = condition;

    if (!eventOccurence || !eventOccurenceValue) {
      continue;
    }

    eventPositive.push({
      term: {
        name: eventName,
      },
    });

    if (eventOccurence === 'exactly') {
      eventPositive.push({
        term: {
          count: eventOccurenceValue,
        },
      });
    }

    if (eventOccurence === 'atleast') {
      eventPositive.push({
        range: {
          count: {
            gte: eventOccurenceValue,
          },
        },
      });
    }

    if (eventOccurence === 'atmost') {
      eventPositive.push({
        range: {
          count: {
            lte: eventOccurenceValue,
          },
        },
      });
    }

    for (const filter of eventAttributeFilters) {
      elkConvertConditionToQuery({
        field: `attributes.${filter.name}`,
        operator: filter.operator,
        value: filter.value,
        positive: eventPositive,
        negative: eventNegative,
      });
    }
  }
};

function elkConvertConditionToQuery(args: { field: string; operator: string; value: string; positive; negative }) {
  const { field, operator, value, positive, negative } = args;

  const fixedValue = value.toLocaleLowerCase();

  // equal
  if (operator === 'e') {
    positive.push({
      term: {
        [`${field}.keyword`]: value,
      },
    });
  }

  // does not equal
  if (operator === 'dne') {
    negative.push({
      term: {
        [`${field}.keyword`]: value,
      },
    });
  }

  // contains
  if (operator === 'c') {
    positive.push({
      wildcard: {
        [field]: `*${fixedValue}*`,
      },
    });
  }

  // does not contains
  if (operator === 'dnc') {
    negative.push({
      wildcard: {
        [field]: `*${fixedValue}*`,
      },
    });
  }

  // greater than equal
  if (operator === 'igt') {
    positive.push({
      range: {
        [field]: {
          gte: fixedValue,
        },
      },
    });
  }

  // less then equal
  if (operator === 'ilt') {
    positive.push({
      range: {
        [field]: {
          lte: fixedValue,
        },
      },
    });
  }

  // is true
  if (operator === 'it') {
    positive.push({
      term: {
        [field]: true,
      },
    });
  }

  // is true
  if (operator === 'if') {
    positive.push({
      term: {
        [field]: false,
      },
    });
  }

  // is set
  if (operator === 'is') {
    positive.push({
      exists: {
        field,
      },
    });
  }

  // is not set
  if (operator === 'ins') {
    negative.push({
      exists: {
        field,
      },
    });
  }
}
