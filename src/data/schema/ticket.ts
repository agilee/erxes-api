import { commonMutationParams, commonTypes, conformityQueryFields, copyParams } from './common';

export const types = `
  type Ticket {
    _id: String!
    source: String
    companies: [Company]
    customers: [Customer]
    ${commonTypes}
  }
`;

export const queries = `
  ticketDetail(_id: String!): Ticket
  tickets(
    pipelineId: String
    stageId: String
    customerIds: [String]
    companyIds: [String]
    date: ItemDate
    skip: Int
    search: String
    assignedUserIds: [String]
    closeDateType: String
    priority: [String]
    source: [String]
    labelIds: [String]
    sortField: String
    sortDirection: Int
    ${conformityQueryFields}
  ): [Ticket]
`;

const ticketMutationParams = `
  source: String,
`;

export const mutations = `
  ticketsAdd(name: String!, ${copyParams}, ${ticketMutationParams}, ${commonMutationParams}): Ticket
  ticketsEdit(_id: String!, name: String, ${ticketMutationParams}, ${commonMutationParams}): Ticket
  ticketsChange( _id: String!, destinationStageId: String): Ticket
  ticketsUpdateOrder(stageId: String!, orders: [OrderItem]): [Ticket]
  ticketsRemove(_id: String!): Ticket
  ticketsWatch(_id: String, isAdd: Boolean): Ticket
  ticketsCopy(_id: String!): Ticket
`;
