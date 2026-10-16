import { describeRepositoryContract } from './testing/contract';
import { createMemoryRepository } from './memory';

describeRepositoryContract('In-memory', createMemoryRepository);
