import { graphqlRequest } from '../db/connection';
import {
  boardFactory,
  checklistFactory,
  checklistItemFactory,
  growthHackFactory,
  pipelineFactory,
  pipelineLabelFactory,
  stageFactory,
  userFactory,
} from '../db/factories';
import { Boards, ChecklistItems, Checklists, GrowthHacks, PipelineLabels, Pipelines, Stages } from '../db/models';
import { IBoardDocument, IPipelineDocument, IStageDocument } from '../db/models/definitions/boards';
import { BOARD_STATUSES, BOARD_TYPES } from '../db/models/definitions/constants';
import { IGrowthHackDocument } from '../db/models/definitions/growthHacks';
import { IPipelineLabelDocument } from '../db/models/definitions/pipelineLabels';

import './setup.ts';

describe('Test growthHacks mutations', () => {
  let board: IBoardDocument;
  let pipeline: IPipelineDocument;
  let stage: IStageDocument;
  let growthHack: IGrowthHackDocument;
  let label: IPipelineLabelDocument;
  let context;

  const commonGrowthHackParamDefs = `
    $name: String!,
    $stageId: String!
    $hackStages: [String]
    $assignedUserIds: [String]
  `;

  const commonGrowthHackParams = `
    name: $name
    stageId: $stageId
    hackStages: $hackStages
    assignedUserIds: $assignedUserIds
  `;

  beforeEach(async () => {
    // Creating test data
    board = await boardFactory({ type: BOARD_TYPES.GROWTH_HACK });
    pipeline = await pipelineFactory({ boardId: board._id });
    stage = await stageFactory({ pipelineId: pipeline._id });
    label = await pipelineLabelFactory();
    growthHack = await growthHackFactory({
      initialStageId: stage._id,
      stageId: stage._id,
      labelIds: [label._id],
    });
    context = { user: await userFactory({}) };
  });

  afterEach(async () => {
    // Clearing test data
    await Boards.deleteMany({});
    await Pipelines.deleteMany({});
    await Stages.deleteMany({});
    await GrowthHacks.deleteMany({});
    await PipelineLabels.deleteMany({});
  });

  test('Create growthHack', async () => {
    const args = {
      name: growthHack.name,
      stageId: stage._id,
      hackStages: ['one', 'two'],
    };

    const mutation = `
      mutation growthHacksAdd(${commonGrowthHackParamDefs}) {
        growthHacksAdd(${commonGrowthHackParams}) {
          _id
          name
          stageId
          hackStages
        }
      }
    `;

    const createdGrowthHack = await graphqlRequest(mutation, 'growthHacksAdd', args, context);

    expect(createdGrowthHack.stageId).toEqual(stage._id);
    expect(createdGrowthHack.hackStages[0]).toEqual(args.hackStages[0]);
    expect(createdGrowthHack.hackStages[1]).toEqual(args.hackStages[1]);
  });

  test('Update growthHack', async () => {
    const stage2 = await stageFactory();

    const args: any = {
      _id: growthHack._id,
      name: 'changed-name',
      stageId: stage2._id,
    };

    const mutation = `
      mutation growthHacksEdit($_id: String!, ${commonGrowthHackParamDefs}) {
        growthHacksEdit(_id: $_id, ${commonGrowthHackParams}) {
          _id
          name
          stageId
          assignedUserIds
        }
      }
    `;

    let updatedGrowthHack = await graphqlRequest(mutation, 'growthHacksEdit', args, context);

    expect(updatedGrowthHack.name).toEqual(args.name);
    expect(updatedGrowthHack.stageId).toEqual(args.stageId);

    args.assignedUserIds = [(await userFactory())._id];
    updatedGrowthHack = await graphqlRequest(mutation, 'growthHacksEdit', args, context);

    expect(updatedGrowthHack.assignedUserIds.length).toBe(args.assignedUserIds.length);
  });

  test('Change growthHack', async () => {
    const args = {
      _id: growthHack._id,
      destinationStageId: growthHack.stageId,
    };

    const mutation = `
      mutation growthHacksChange($_id: String!, $destinationStageId: String!) {
        growthHacksChange(_id: $_id, destinationStageId: $destinationStageId) {
          _id,
          stageId
        }
      }
    `;

    const updatedGrowthHack = await graphqlRequest(mutation, 'growthHacksChange', args, context);

    expect(updatedGrowthHack._id).toEqual(args._id);
  });

  test('Change growthHack if move to another stage', async () => {
    const anotherStage = await stageFactory({ pipelineId: pipeline._id });

    const args = {
      _id: growthHack._id,
      destinationStageId: anotherStage._id,
    };

    const mutation = `
      mutation growthHacksChange($_id: String!, $destinationStageId: String!) {
        growthHacksChange(_id: $_id, destinationStageId: $destinationStageId) {
          _id,
          stageId
        }
      }
    `;

    const updatedGH = await graphqlRequest(mutation, 'growthHacksChange', args);

    expect(updatedGH._id).toEqual(args._id);
  });

  test('GrowthHack update orders', async () => {
    const growthHackToStage = await growthHackFactory({});

    const args = {
      orders: [
        { _id: growthHack._id, order: 9 },
        { _id: growthHackToStage._id, order: 3 },
      ],
      stageId: stage._id,
    };

    const mutation = `
      mutation growthHacksUpdateOrder($stageId: String!, $orders: [OrderItem]) {
        growthHacksUpdateOrder(stageId: $stageId, orders: $orders) {
          _id
          stageId
          order
        }
      }
    `;

    const [updatedGrowthHack, updatedGrowthHackToOrder] = await graphqlRequest(
      mutation,
      'growthHacksUpdateOrder',
      args,
      context,
    );

    expect(updatedGrowthHack.order).toBe(3);
    expect(updatedGrowthHackToOrder.order).toBe(9);
    expect(updatedGrowthHack.stageId).toBe(stage._id);
  });

  test('Remove growthHack', async () => {
    const mutation = `
      mutation growthHacksRemove($_id: String!) {
        growthHacksRemove(_id: $_id) {
          _id
        }
      }
    `;

    await graphqlRequest(mutation, 'growthHacksRemove', { _id: growthHack._id }, context);

    expect(await GrowthHacks.findOne({ _id: growthHack._id })).toBe(null);
  });

  test('Watch growthHack', async () => {
    const mutation = `
      mutation growthHacksWatch($_id: String!, $isAdd: Boolean!) {
        growthHacksWatch(_id: $_id, isAdd: $isAdd) {
          _id
          isWatched
        }
      }
    `;

    const watchAddGrowthHack = await graphqlRequest(
      mutation,
      'growthHacksWatch',
      { _id: growthHack._id, isAdd: true },
      context,
    );

    expect(watchAddGrowthHack.isWatched).toBe(true);

    const watchRemoveGrowthHack = await graphqlRequest(
      mutation,
      'growthHacksWatch',
      { _id: growthHack._id, isAdd: false },
      context,
    );

    expect(watchRemoveGrowthHack.isWatched).toBe(false);
  });

  test('Vote growthHack', async () => {
    const mutation = `
      mutation growthHacksVote($_id: String!, $isVote: Boolean!) {
        growthHacksVote(_id: $_id, isVote: $isVote) {
          _id
          voteCount
          isVoted
          votedUsers {
            _id
          }
        }
      }
    `;

    const votedGrowthHack = await graphqlRequest(
      mutation,
      'growthHacksVote',
      { _id: growthHack._id, isVote: true },
      context,
    );

    expect(votedGrowthHack.voteCount).toBe(1);
    expect(votedGrowthHack.votedUsers[0]._id).toBe(context.user._id);
    expect(votedGrowthHack.isVoted).toBe(true);

    const unvotedGrowthHack = await graphqlRequest(
      mutation,
      'growthHacksVote',
      { _id: growthHack._id, isVote: false },
      context,
    );

    expect(unvotedGrowthHack.voteCount).toBe(0);
    expect(unvotedGrowthHack.votedUsers.length).toBe(0);
    expect(unvotedGrowthHack.isVoted).toBe(false);
  });

  test('Test growthHacksCopy()', async () => {
    const mutation = `
      mutation growthHacksCopy($_id: String!) {
        growthHacksCopy(_id: $_id) {
          _id
          userId
          name
          stageId
        }
      }
    `;

    const checklist = await checklistFactory({
      contentType: 'growthHack',
      contentTypeId: growthHack._id,
      title: 'gh-checklist',
    });

    await checklistItemFactory({
      checklistId: checklist._id,
      content: 'Improve growthHack mutation test coverage',
      isChecked: true,
    });

    const result = await graphqlRequest(mutation, 'growthHacksCopy', { _id: growthHack._id }, context);

    const clonedGhChecklist = await Checklists.findOne({ contentTypeId: result._id });

    if (clonedGhChecklist) {
      const clonedGhChecklistItems = await ChecklistItems.find({ checklistId: clonedGhChecklist._id });

      expect(clonedGhChecklist.contentTypeId).toBe(result._id);
      expect(clonedGhChecklistItems.length).toBe(1);
    }

    expect(result.name).toBe(`${growthHack.name}-copied`);
    expect(result.stageId).toBe(growthHack.stageId);
  });

  test('Growth hack archive', async () => {
    const mutation = `
      mutation growthHacksArchive($stageId: String!) {
        growthHacksArchive(stageId: $stageId)
      }
    `;

    const ghStage = await stageFactory({ type: BOARD_TYPES.GROWTH_HACK });

    await growthHackFactory({ stageId: ghStage._id });
    await growthHackFactory({ stageId: ghStage._id });
    await growthHackFactory({ stageId: ghStage._id });

    await graphqlRequest(mutation, 'growthHacksArchive', { stageId: ghStage._id });

    const ghs = await GrowthHacks.find({ stageId: ghStage._id, status: BOARD_STATUSES.ARCHIVED });

    expect(ghs.length).toBe(3);
  });
});
